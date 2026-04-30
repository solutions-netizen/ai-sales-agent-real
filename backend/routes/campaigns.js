// backend/routes/campaigns.js
import { Router } from "express";
import db from "../db.js";

const router = Router();

router.get("/", (req, res) => {
  const campaigns = db.prepare("SELECT * FROM campaigns ORDER BY created_at DESC").all();
  res.json({ ok: true, campaigns });
});

router.patch("/:id", (req, res) => {
  const { active, name, message_template } = req.body;
  const updates = [];
  const values = [];

  if (active !== undefined) { updates.push("active = ?");           values.push(active ? 1 : 0); }
  if (name)                  { updates.push("name = ?");             values.push(name); }
  if (message_template)      { updates.push("message_template = ?"); values.push(message_template); }

  if (updates.length === 0) return res.status(400).json({ ok: false, error: "Nothing to update" });
  values.push(req.params.id);

  db.prepare(`UPDATE campaigns SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const updated = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(req.params.id);
  res.json({ ok: true, campaign: updated });
});

export default router;
