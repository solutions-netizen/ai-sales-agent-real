// backend/routes/leads.js
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import { scoreLead } from "../services/leadScoring.js";
import { logActivity } from "../services/activityService.js";
import { scheduleFollowUpSequence, triggerManualFollowUp } from "../services/followUpEngine.js";
import { makeCall } from "../services/twilioService.js";

const router = Router();

// Basic E.164 phone validation — must have 7–15 digits (#4)
function isValidPhone(phone) {
  if (!phone) return true; // phone is optional
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

// Normalize phone to E.164 best-effort (prepend +1 if 10-digit US number)
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

// GET /api/leads — list all leads with optional filtering
router.get("/", (req, res) => {
  const { stage, product, source, limit = 200, offset = 0 } = req.query;
  let sql = "SELECT * FROM leads WHERE deleted_at IS NULL";
  const params = [];

  if (stage)   { sql += " AND stage = ?";            params.push(stage); }
  if (product) { sql += " AND product_interest = ?"; params.push(product); }
  if (source)  { sql += " AND source = ?";           params.push(source); }

  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));

  const leads = db.prepare(sql).all(...params);
  res.json({ ok: true, leads });
});

// GET /api/leads/stats — dashboard metrics (#7: consolidated into fewer queries)
router.get("/stats", (req, res) => {
  // Single query for all stage-based counts
  const stageCounts = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN stage = 'placed' THEN 1 END) as placed,
      COUNT(CASE WHEN stage NOT IN ('placed','lost') THEN 1 END) as pipeline,
      COUNT(CASE WHEN ai_score >= 70 THEN 1 END) as hotLeads,
      COUNT(CASE WHEN next_followup <= datetime('now') AND stage NOT IN ('placed','lost') THEN 1 END) as followupsDue
    FROM leads WHERE deleted_at IS NULL
  `).get();

  // Single query for referral counts
  const refCounts = db.prepare(`
    SELECT
      COUNT(*) as referrals,
      COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted
    FROM referrals
  `).get();

  const byStage = db.prepare(
    "SELECT stage, COUNT(*) as count FROM leads WHERE deleted_at IS NULL GROUP BY stage"
  ).all();

  const byProduct = db.prepare(
    "SELECT product_interest as product, COUNT(*) as count FROM leads WHERE deleted_at IS NULL GROUP BY product_interest"
  ).all();

  const recentActivity = db.prepare(
    "SELECT * FROM activity ORDER BY created_at DESC LIMIT 10"
  ).all();

  res.json({
    ok: true,
    stats: { ...stageCounts, ...refCounts },
    byStage,
    byProduct,
    recentActivity,
  });
});

// GET /api/leads/:id
router.get("/:id", (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });

  const followups = db.prepare(
    "SELECT * FROM followups WHERE lead_id = ? ORDER BY sent_at DESC"
  ).all(req.params.id);

  const activity = db.prepare(
    "SELECT * FROM activity WHERE lead_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(req.params.id);

  const referrals = db.prepare(
    "SELECT * FROM referrals WHERE policyholder_id = ?"
  ).all(req.params.id);

  res.json({ ok: true, lead, followups, activity, referrals });
});

// POST /api/leads — create new lead (used by landing page form & webhooks)
router.post("/", async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone,
      product_interest = "term-life",
      coverage_amount, monthly_budget, health_rating,
      tobacco_use = 0, age, beneficiary,
      source = "landing-page", referral_id, notes,
    } = req.body;

    if (!first_name) return res.status(400).json({ ok: false, error: "first_name required" });

    // Phone validation (#4)
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ ok: false, error: "Invalid phone number. Please provide a valid number with 7–15 digits." });
    }
    const normalizedPhone = normalizePhone(phone);

    const id = uuidv4();
    const { score, reason } = await scoreLead({
      age, health_rating, tobacco_use, coverage_amount, monthly_budget,
      product_interest, beneficiary, phone: normalizedPhone, email,
    });

    db.prepare(`
      INSERT INTO leads (
        id, first_name, last_name, email, phone,
        product_interest, coverage_amount, monthly_budget,
        health_rating, tobacco_use, age, beneficiary,
        stage, ai_score, score_reason, source, referral_id, notes,
        next_followup
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        'new', ?, ?, ?, ?, ?,
        datetime('now', '+1 hour')
      )
    `).run(
      id, first_name, last_name || null, email || null, normalizedPhone,
      product_interest, coverage_amount || null, monthly_budget || null,
      health_rating || null, tobacco_use ? 1 : 0, age || null, beneficiary || null,
      score, reason, source, referral_id || null, notes || null
    );

    logActivity(id, "note", `New lead captured via ${source}. AI Score: ${score}/100`, { score, reason });

    // Kick off automated follow-up sequence (non-blocking)
    scheduleFollowUpSequence(id).catch(err =>
      console.error("Follow-up schedule error:", err)
    );

    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(id);
    res.status(201).json({ ok: true, lead });
  } catch (err) {
    console.error("POST /api/leads error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/leads/:id — update lead (stage, notes, etc.)
router.patch("/:id", (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });

  // Phone validation on update (#4)
  if (req.body.phone && !isValidPhone(req.body.phone)) {
    return res.status(400).json({ ok: false, error: "Invalid phone number." });
  }
  if (req.body.phone) {
    req.body.phone = normalizePhone(req.body.phone);
  }

  const allowed = [
    "first_name","last_name","email","phone",
    "product_interest","coverage_amount","monthly_budget",
    "health_rating","tobacco_use","age","beneficiary",
    "stage","notes","last_contact","next_followup",
  ];

  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  }

  if (updates.length === 0) return res.json({ ok: true, lead });

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);

  db.prepare(`UPDATE leads SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  if (req.body.stage && req.body.stage !== lead.stage) {
    logActivity(req.params.id, "stage-change",
      `Stage changed: ${lead.stage} → ${req.body.stage}`, { from: lead.stage, to: req.body.stage });
  }

  const updated = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  res.json({ ok: true, lead: updated });
});

// DELETE /api/leads/:id — soft delete (#11)
router.delete("/:id", (req, res) => {
  const lead = db.prepare("SELECT id FROM leads WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });

  db.prepare("UPDATE leads SET deleted_at = datetime('now'), stage = 'lost' WHERE id = ?").run(req.params.id);
  logActivity(req.params.id, "note", "Lead soft-deleted", {});
  res.json({ ok: true, deleted: req.params.id });
});

// ── Action routes (moved from app.js into the router — #1) ─────────────────

// POST /api/leads/:id/sms — manual SMS trigger
router.post("/:id/sms", async (req, res) => {
  try {
    const lead = db.prepare("SELECT * FROM leads WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });
    if (!lead.phone) return res.status(400).json({ ok: false, error: "Lead has no phone number" });

    await triggerManualFollowUp(req.params.id, "sms");
    res.json({ ok: true, message: "SMS sent" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/leads/:id/call — manual AI call trigger
router.post("/:id/call", async (req, res) => {
  try {
    const lead = db.prepare("SELECT * FROM leads WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });
    if (!lead.phone) return res.status(400).json({ ok: false, error: "Lead has no phone number" });

    const scriptKey = req.body.scriptKey || "hot-lead";
    await makeCall(lead.phone, scriptKey, { firstName: lead.first_name });
    logActivity(lead.id, "call", `Manual AI call placed (script: ${scriptKey})`, { scriptKey });

    res.json({ ok: true, message: "Call placed" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
