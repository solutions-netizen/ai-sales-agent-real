// backend/services/followUpEngine.js
// Multi-touch automated follow-up engine for life insurance leads.
// Touch sequence:
//   Touch 1: Immediate welcome SMS (day 0)
//   Touch 2: Follow-up SMS (day 2)
//   Touch 3: Quote nudge SMS (day 5)
//   Touch 4: AI outbound call (day 7)
//   Touch 5: Re-engagement SMS (day 14)
//   Touch 6: Final check-in SMS (day 30)

import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import { sendSMS, makeCall } from "./twilioService.js";
import { logActivity } from "./activityService.js";

const AGENT_NAME  = process.env.AGENT_NAME  || "Andrea";
const AGENCY_NAME = process.env.AGENCY_NAME || "Living Life Resources";
const BASE_URL    = process.env.BASE_URL     || "https://yoursite.com";

// Node.js setTimeout max is ~24.8 days (2^31-1 ms). Clamp each delay to that limit.
const MAX_DELAY = 2147483647;

// Touch schedule definition — returns the full 6-touch sequence for a lead.
function buildSequence(lead) {
  const name     = lead.first_name;
  const product  = PRODUCT_LABELS[lead.product_interest] || "life insurance";
  const coverage = lead.coverage_amount ? `$${lead.coverage_amount.toLocaleString()}` : "the right amount";
  const refLink  = `${BASE_URL}/capture.html?ref=${lead.id}`;

  return [
    {
      touch: 1,
      delayMs: 0,
      channel: "sms",
      message: `Hi ${name}! This is ${AGENT_NAME} with ${AGENCY_NAME}. Thanks for your interest in ${product}. I'll personally reach out shortly. Reply CALL ME if you'd like to chat right now! 🛡️`,
    },
    {
      touch: 2,
      delayMs: 2 * 24 * 60 * 60 * 1000, // day 2
      channel: "sms",
      message: `Hi ${name}, ${AGENT_NAME} here! Just checking in about your ${product} inquiry. A quick 10-min call could lock in the best rate for your age. Reply YES to schedule! 📋`,
    },
    {
      touch: 3,
      delayMs: 5 * 24 * 60 * 60 * 1000, // day 5
      channel: "sms",
      message: `${name}, did you know ${coverage} in coverage can cost less than a cup of coffee a day? Let me run your free quote — zero obligation. Reply QUOTE to get started! ☕`,
    },
    {
      touch: 4,
      delayMs: 7 * 24 * 60 * 60 * 1000, // day 7
      channel: "call",
      scriptKey: "follow-up",
      vars: { firstName: name, touchNumber: "4" },
    },
    {
      touch: 5,
      delayMs: 14 * 24 * 60 * 60 * 1000, // day 14
      channel: "sms",
      message: `${name}, life moves fast — don't leave your family unprotected. ${AGENT_NAME} at ${AGENCY_NAME} is still here to help. Reply READY when you want your free review. No pressure! 💙`,
    },
    {
      touch: 6,
      delayMs: 30 * 24 * 60 * 60 * 1000, // day 30
      channel: "sms",
      // BASE_URL now wired in so {{referralLink}} is always substituted (#5)
      message: `Last check-in, ${name}! ${AGENT_NAME} here. Know someone who needs coverage too? Share: ${refLink} — or reply REMOVE to opt out. Wishing you well! 😊`,
    },
  ];
}

const PRODUCT_LABELS = {
  "term-life":           "term life insurance",
  "whole-life":          "whole life insurance",
  "iul":                 "indexed universal life insurance",
  "final-expense":       "final expense coverage",
  "mortgage-protection": "mortgage protection insurance",
  "annuity":             "annuity planning",
};

// Core: fire a single touch for a lead, using the freshest DB state.
// Always re-fetches the lead so we use current phone/stage, not a stale closure (#8).
async function fireTouchIfDue(leadId, touch) {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId);

  // Stop sequence if lead is gone, closed, or phone was removed
  if (!lead || ["placed", "lost"].includes(lead.stage) || !lead.phone) return;

  // Idempotency: skip if this touch was already sent
  const already = db.prepare(
    "SELECT id FROM followups WHERE lead_id = ? AND sequence = ?"
  ).get(leadId, touch.touch);
  if (already) return;

  try {
    if (touch.channel === "sms" && touch.message) {
      await sendSMS(lead.phone, touch.message); // uses current lead.phone (#8 fixed)
      db.prepare(`
        INSERT INTO followups (id, lead_id, channel, sequence, status, message)
        VALUES (?, ?, 'sms', ?, 'sent', ?)
      `).run(uuidv4(), leadId, touch.touch, touch.message);
      logActivity(leadId, "sms", `Auto-touch ${touch.touch} SMS sent`, { touch: touch.touch });

    } else if (touch.channel === "call") {
      await makeCall(lead.phone, touch.scriptKey || "follow-up", touch.vars || {});
      db.prepare(`
        INSERT INTO followups (id, lead_id, channel, sequence, status, message)
        VALUES (?, ?, 'call', ?, 'sent', ?)
      `).run(uuidv4(), leadId, touch.touch, `AI call — script: ${touch.scriptKey}`);
      logActivity(leadId, "call", `Auto-touch ${touch.touch} AI call placed`, { touch: touch.touch });
    }

    // Record when the next touch is due
    const sequence = buildSequence(lead);
    const nextTouch = sequence.find(t => t.touch === touch.touch + 1);
    if (nextTouch) {
      const nextDate = new Date(Date.now() + nextTouch.delayMs).toISOString();
      db.prepare("UPDATE leads SET next_followup = ?, last_contact = datetime('now') WHERE id = ?")
        .run(nextDate, leadId);
    }
  } catch (err) {
    console.error(`Follow-up touch ${touch.touch} failed for lead ${leadId}:`, err.message);
    db.prepare(`
      INSERT INTO followups (id, lead_id, channel, sequence, status, message)
      VALUES (?, ?, ?, ?, 'failed', ?)
    `).run(uuidv4(), leadId, touch.channel, touch.touch, err.message);
  }
}

// Schedule all remaining touches for a lead, computing delay relative to now.
// Safe to call multiple times — fireTouchIfDue is idempotent.
function scheduleTouches(lead, sequence) {
  const createdAt = new Date(lead.created_at).getTime();

  for (const touch of sequence) {
    const fireAt   = createdAt + touch.delayMs;
    const delayMs  = Math.max(0, fireAt - Date.now());

    if (delayMs > MAX_DELAY) continue; // beyond Node's 32-bit limit; recoverSequences will re-add after restart

    setTimeout(() => fireTouchIfDue(lead.id, touch), delayMs);
  }
}

// Called when a new lead is created.
export async function scheduleFollowUpSequence(leadId) {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId);
  if (!lead || !lead.phone) return;

  const sequence = buildSequence(lead);
  scheduleTouches(lead, sequence);

  console.log(`✅ Follow-up sequence scheduled for lead ${leadId} (${lead.first_name}) — ${sequence.length} touches`);
}

// Called at server startup to recover sequences lost during restart (#2).
// Queries all active leads and re-schedules any touches not yet logged.
export async function recoverSequences() {
  const activeLeads = db.prepare(
    "SELECT * FROM leads WHERE stage NOT IN ('placed','lost') AND phone IS NOT NULL"
  ).all();

  if (activeLeads.length === 0) return;

  let recovered = 0;
  for (const lead of activeLeads) {
    const sequence    = buildSequence(lead);
    const sentTouches = db.prepare(
      "SELECT sequence FROM followups WHERE lead_id = ? AND status != 'failed'"
    ).all(lead.id).map(r => r.sequence);

    const pending = sequence.filter(t => !sentTouches.includes(t.touch));
    if (pending.length === 0) continue;

    scheduleTouches(lead, pending);
    recovered++;
  }

  if (recovered > 0) {
    console.log(`♻️  Recovered follow-up sequences for ${recovered} active lead(s)`);
  }
}

// Manually trigger a single follow-up touch (used by agent from dashboard).
export async function triggerManualFollowUp(leadId, channel = "sms") {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId);
  if (!lead) throw new Error("Lead not found");

  const lastTouch = db.prepare(
    "SELECT MAX(sequence) as last FROM followups WHERE lead_id = ?"
  ).get(leadId);
  const nextTouch = (lastTouch?.last || 0) + 1;

  const name = lead.first_name;

  if (channel === "sms" && lead.phone) {
    const message = `Hi ${name}, ${AGENT_NAME} here from ${AGENCY_NAME}! Just wanted to personally check in about your life insurance questions. Reply YES and I'll call you right back! 🙂`;
    await sendSMS(lead.phone, message);
    db.prepare(`
      INSERT INTO followups (id, lead_id, channel, sequence, status, message)
      VALUES (?, ?, 'sms', ?, 'sent', ?)
    `).run(uuidv4(), leadId, nextTouch, message);
    logActivity(leadId, "sms", `Manual SMS sent (touch ${nextTouch})`, {});

  } else if (channel === "call" && lead.phone) {
    await makeCall(lead.phone, "hot-lead", { firstName: name });
    db.prepare(`
      INSERT INTO followups (id, lead_id, channel, sequence, status, message)
      VALUES (?, ?, 'call', ?, 'sent', ?)
    `).run(uuidv4(), leadId, nextTouch, "Manual AI call");
    logActivity(leadId, "call", `Manual AI call placed (touch ${nextTouch})`, {});
  }

  db.prepare("UPDATE leads SET last_contact = datetime('now') WHERE id = ?").run(leadId);
}
