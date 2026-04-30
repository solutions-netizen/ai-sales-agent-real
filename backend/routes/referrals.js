// backend/routes/referrals.js
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import { logActivity } from "../services/activityService.js";
import { sendSMS } from "../services/twilioService.js";

const router = Router();

// GET /api/referrals
router.get("/", (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT r.*,
      p.first_name as policyholder_first, p.last_name as policyholder_last,
      l.first_name as lead_first, l.last_name as lead_last, l.stage as lead_stage
    FROM referrals r
    LEFT JOIN leads p ON p.id = r.policyholder_id
    LEFT JOIN leads l ON l.id = r.referred_lead_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += " AND r.status = ?"; params.push(status); }
  sql += " ORDER BY r.created_at DESC";

  const referrals = db.prepare(sql).all(...params);
  res.json({ ok: true, referrals });
});

// POST /api/referrals — log a new referral
router.post("/", (req, res) => {
  const {
    policyholder_id, ref_first_name, ref_last_name,
    ref_phone, ref_email, ref_relationship, notes,
  } = req.body;

  if (!policyholder_id || !ref_first_name) {
    return res.status(400).json({ ok: false, error: "policyholder_id and ref_first_name required" });
  }

  const policyholder = db.prepare("SELECT * FROM leads WHERE id = ?").get(policyholder_id);
  if (!policyholder) return res.status(404).json({ ok: false, error: "Policyholder lead not found" });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO referrals (id, policyholder_id, ref_first_name, ref_last_name, ref_phone, ref_email, ref_relationship, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, policyholder_id, ref_first_name, ref_last_name || null, ref_phone || null, ref_email || null, ref_relationship || null, notes || null);

  logActivity(policyholder_id, "referral-sent",
    `Referral added: ${ref_first_name} ${ref_last_name || ""} (${ref_relationship || "unknown"})`,
    { referral_id: id }
  );

  const referral = db.prepare("SELECT * FROM referrals WHERE id = ?").get(id);
  res.status(201).json({ ok: true, referral });
});

// POST /api/referrals/:id/send-sms — send referral outreach SMS to the referred contact
router.post("/:id/send-sms", async (req, res) => {
  const referral = db.prepare("SELECT * FROM referrals WHERE id = ?").get(req.params.id);
  if (!referral) return res.status(404).json({ ok: false, error: "Referral not found" });
  if (!referral.ref_phone) return res.status(400).json({ ok: false, error: "No phone number for this referral" });

  const policyholder = db.prepare("SELECT * FROM leads WHERE id = ?").get(referral.policyholder_id);
  const agentName = process.env.AGENT_NAME || "Andrea";
  const agencyName = process.env.AGENCY_NAME || "Living Life Resources";

  const message =
    `Hi ${referral.ref_first_name}! ${agentName} here from ${agencyName}. ` +
    `Your ${referral.ref_relationship || "contact"} ${policyholder?.first_name || "a valued client"} thought you might benefit from a free life insurance review. ` +
    `No pressure — just a quick 10-min call. Reply YES and I'll reach out! 🛡️`;

  try {
    await sendSMS(referral.ref_phone, message);
    db.prepare("UPDATE referrals SET status='contacted' WHERE id = ?").run(req.params.id);
    logActivity(referral.policyholder_id, "sms",
      `Referral SMS sent to ${referral.ref_first_name} ${referral.ref_last_name || ""}`, { referral_id: referral.id });
    res.json({ ok: true, message: "SMS sent" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/referrals/:id
router.patch("/:id", (req, res) => {
  const { status, notes, referred_lead_id } = req.body;
  const updates = [];
  const values = [];

  if (status)          { updates.push("status = ?");           values.push(status); }
  if (notes)           { updates.push("notes = ?");            values.push(notes); }
  if (referred_lead_id){ updates.push("referred_lead_id = ?"); values.push(referred_lead_id); }
  if (status === "converted") {
    updates.push("converted_at = datetime('now')");
  }

  if (updates.length === 0) return res.status(400).json({ ok: false, error: "Nothing to update" });
  values.push(req.params.id);

  db.prepare(`UPDATE referrals SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const updated = db.prepare("SELECT * FROM referrals WHERE id = ?").get(req.params.id);
  res.json({ ok: true, referral: updated });
});

export default router;
