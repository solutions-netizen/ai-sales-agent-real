// backend/app.js — Life Insurance AI Sales Platform
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

import leadsRouter     from "./routes/leads.js";
import referralsRouter from "./routes/referrals.js";
import campaignsRouter from "./routes/campaigns.js";

import { makeCall, sendSMS }        from "./services/twilioService.js";
import { qualifyLeadChat }          from "./services/gptService.js";
import { triggerManualFollowUp }    from "./services/followUpEngine.js";
import { logActivity }              from "./services/activityService.js";
import db                           from "./db.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../frontend")));

// ── API Routes ──────────────────────────────────────────────────────────────
app.use("/api/leads",     leadsRouter);
app.use("/api/referrals", referralsRouter);
app.use("/api/campaigns", campaignsRouter);

// ── Manual trigger: send SMS to a lead ─────────────────────────────────────
app.post("/api/leads/:id/sms", async (req, res) => {
  try {
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });
    if (!lead.phone) return res.status(400).json({ ok: false, error: "Lead has no phone number" });

    await triggerManualFollowUp(req.params.id, "sms");
    res.json({ ok: true, message: "SMS sent" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Manual trigger: AI call to a lead ──────────────────────────────────────
app.post("/api/leads/:id/call", async (req, res) => {
  try {
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
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

// ── Chat qualification widget endpoint ─────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  try {
    const { messages = [], leadData = {} } = req.body;
    const reply = await qualifyLeadChat(messages, leadData);
    res.json({ ok: true, reply });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Brevo webhook (legacy support) ─────────────────────────────────────────
app.post("/brevo/webhook", async (req, res) => {
  try {
    const body    = req.body || {};
    const contact = body.contact || {};
    const attrs   = body.attributes || contact.attributes || {};

    const phone = attrs.SMS || attrs.PHONE || attrs.Mobile || body.phone || contact.phone || null;
    const first = (attrs.FIRSTNAME || attrs.FirstName || "Friend").toString().trim();

    if (!phone) return res.status(400).send("Missing phone number");

    await makeCall(phone, "cold-call", { firstName: first });
    res.status(200).send("ok");
  } catch (err) {
    console.error("Brevo webhook error:", err);
    res.status(500).send("Server error");
  }
});

// ── Zapier webhook ─────────────────────────────────────────────────────────
app.post("/zapier-call", async (req, res) => {
  try {
    const { phoneNumber, name, email, readinessLevel, score, notes } = req.body || {};
    if (!phoneNumber) return res.status(400).json({ ok: false, error: "Missing phone number" });

    const firstName = (name || "friend").split(" ")[0].trim();
    const scriptKey = score >= 70 ? "hot-lead" : "cold-call";

    await makeCall(phoneNumber, scriptKey, { firstName });
    res.json({ ok: true, message: "Call initiated" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Health check ────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ ok: true, status: "Life Insurance AI Sales Platform running 🛡️" });
});

// ── SPA fallback — serve frontend for all other routes ─────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🛡️  Life Insurance AI Sales Platform`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`📋 Leads API: http://localhost:${PORT}/api/leads\n`);
});
