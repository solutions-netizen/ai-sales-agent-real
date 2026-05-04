// backend/services/twilioService.js
import twilio from "twilio";
import dotenv from "dotenv";
import { getCallScript } from "./gptService.js";
import { callScripts } from "./scripts.js";
dotenv.config();

let _client;
function getClient() {
  if (!_client) {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error("Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env");
    _client = twilio(sid, token);
  }
  return _client;
}

const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_CALLER_ID;

// Sanitize text before embedding in TwiML XML to prevent injection (#12)
function escapeTwiml(text) {
  return text.replace(/[<>&"']/g, c => (
    { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]
  ));
}

// Outbound AI call
export async function makeCall(toNumber, scriptKey = "cold-call", vars = {}) {
  const template = callScripts[scriptKey] || callScripts["cold-call"];
  const spoken   = escapeTwiml(await getCallScript(template, vars));

  const call = await getClient().calls.create({
    to:    toNumber,
    from:  FROM_NUMBER,
    twiml: `<Response><Say voice="Polly.Joanna">${spoken}</Say></Response>`,
  });

  console.log(`📞 Call placed to ${toNumber} [${scriptKey}] — SID: ${call.sid}`);
  return call.sid;
}

// Outbound SMS
export async function sendSMS(toNumber, message) {
  const msg = await getClient().messages.create({
    to:   toNumber,
    from: FROM_NUMBER,
    body: message,
  });
  console.log(`💬 SMS sent to ${toNumber} — SID: ${msg.sid}`);
  return msg.sid;
}
