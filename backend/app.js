// backend/app.js — Life Insurance AI Sales Platform
import express from "express";
import bodyParser from "body-parser";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import leadsRouter     from "./routes/leads.js";
import referralsRouter from "./routes/referrals.js";
import campaignsRouter from "./routes/campaigns.js";

import { makeCall }         from "./services/twilioService.js";
import { qualifyLeadChat }  from "./services/gptService.js";
import { recoverSequences } from "./services/followUpEngine.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../frontend")));

// ── Rate limiting ───────────────────────────────────────────────────────────
// Public lead capture form: 10 submissions per IP per 15 minutes
const leadCaptureLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many submissions. Please try again in 15 minutes." },
});

// Chat widget: 60 messages per IP per 10 minutes
const chatLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Chat rate limit reached. Please slow down." },
});

// Webhook endpoints: 100 per minute (trusted callers but still guarded)
const webhookLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── API Routes ──────────────────────────────────────────────────────────────
// Apply lead capture rate limit only to POST /api/leads (public form)
app.post("/api/leads", leadCaptureLimit);
app.use("/api/leads",     leadsRouter);
app.use("/api/referrals", referralsRouter);
app.use("/api/campaigns", campaignsRouter);

// ── Chat qualification widget endpoint ─────────────────────────────────────
app.post("/api/chat", chatLimit, async (req, res) => {
  try {
    const { messages = [], leadData = {} } = req.body;
    // Trim to last 10 exchanges to cap token cost (#9)
    const trimmed = messages.slice(-10);
    const reply = await qualifyLeadChat(trimmed, leadData);
    res.json({ ok: true, reply });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Brevo webhook (legacy support) ─────────────────────────────────────────
app.post("/brevo/webhook", webhookLimit, async (req, res) => {
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
app.post("/zapier-call", webhookLimit, async (req, res) => {
  try {
    const { phoneNumber, name, score } = req.body || {};
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

  // Recover any follow-up sequences lost during previous server restart (#2)
  recoverSequences().catch(err =>
    console.error("Follow-up recovery error:", err.message)
  );
});
