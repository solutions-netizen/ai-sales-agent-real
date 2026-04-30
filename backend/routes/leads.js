// backend/routes/leads.js
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import { scoreLead } from "../services/leadScoring.js";
import { logActivity } from "../services/activityService.js";
import { scheduleFollowUpSequence } from "../services/followUpEngine.js";

const router = Router();

// GET /api/leads — list all leads with optional filtering
router.get("/", (req, res) => {
  const { stage, product, source, limit = 200, offset = 0 } = req.query;
  let sql = "SELECT * FROM leads WHERE 1=1";
  const params = [];

  if (stage)   { sql += " AND stage = ?";            params.push(stage); }
  if (product) { sql += " AND product_interest = ?"; params.push(product); }
  if (source)  { sql += " AND source = ?";           params.push(source); }

  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));

  const leads = db.prepare(sql).all(...params);
  res.json({ ok: true, leads });
});

// GET /api/leads/stats — dashboard metrics
router.get("/stats", (req, res) => {
  const total       = db.prepare("SELECT COUNT(*) as c FROM leads").get().c;
  const placed      = db.prepare("SELECT COUNT(*) as c FROM leads WHERE stage='placed'").get().c;
  const pipeline    = db.prepare("SELECT COUNT(*) as c FROM leads WHERE stage NOT IN ('placed','lost')").get().c;
  const hotLeads    = db.prepare("SELECT COUNT(*) as c FROM leads WHERE ai_score >= 70").get().c;
  const referrals   = db.prepare("SELECT COUNT(*) as c FROM referrals").get().c;
  const converted   = db.prepare("SELECT COUNT(*) as c FROM referrals WHERE status='converted'").get().c;
  const followupsDue = db.prepare(
    "SELECT COUNT(*) as c FROM leads WHERE next_followup <= datetime('now') AND stage NOT IN ('placed','lost')"
  ).get().c;

  const byStage = db.prepare(
    "SELECT stage, COUNT(*) as count FROM leads GROUP BY stage"
  ).all();

  const byProduct = db.prepare(
    "SELECT product_interest as product, COUNT(*) as count FROM leads GROUP BY product_interest"
  ).all();

  const recentActivity = db.prepare(
    "SELECT * FROM activity ORDER BY created_at DESC LIMIT 10"
  ).all();

  res.json({
    ok: true,
    stats: { total, placed, pipeline, hotLeads, referrals, converted, followupsDue },
    byStage,
    byProduct,
    recentActivity,
  });
});

// GET /api/leads/:id
router.get("/:id", (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
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

    const id = uuidv4();
    const { score, reason } = await scoreLead({
      age, health_rating, tobacco_use, coverage_amount, monthly_budget,
      product_interest, beneficiary, phone, email,
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
      id, first_name, last_name || null, email || null, phone || null,
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

// PATCH /api/leads/:id — update lead (stage, notes, score, etc.)
router.patch("/:id", (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });

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

// DELETE /api/leads/:id
router.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ ok: false, error: "Lead not found" });
  res.json({ ok: true, deleted: req.params.id });
});

export default router;
