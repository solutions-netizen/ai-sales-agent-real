// twilioService.js
// Clean Twilio helper with built-in callScripts

import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const callerId = process.env.TWILIO_CALLER_ID; // Your Twilio phone number

if (!accountSid || !authToken || !callerId) {
  console.warn(
    "⚠️ Twilio env vars missing. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_CALLER_ID."
  );
}

const client = twilio(accountSid, authToken);

// Simple scripts the caller can use.
// You can tweak these later to match your exact wording.
const callScripts = {
  "hot-lead": (firstName = "friend") =>
    `Hi ${firstName}, this is the AI assistant for Andrea Edwards with Living Life Resources. You recently requested a quick financial checkup. I'm calling to help you get clarity, guidance, and a simple plan. Is now a good time to talk?`,

  "cold-call": (firstName = "friend") =>
    `Hi ${firstName}, this is the AI assistant for Andrea Edwards with Living Life Resources, reaching out with some helpful information about protecting and growing your money.`
};

/**
 * Places a call using Twilio and reads out a simple script.
 *
 * @param {string} phoneNumber - The destination phone number (in E.164 format like +12025550123)
 * @param {string} scriptKey - Which script to use ("hot-lead", "cold-call", etc.)
 * @param {string} firstName - First name to personalize the script
 */
export async function makeCall(
  phoneNumber,
  scriptKey = "hot-lead",
  firstName = "friend"
) {
  const scriptFn = callScripts[scriptKey] || callScripts["hot-lead"];
  const scriptText =
    typeof scriptFn === "function" ? scriptFn(firstName) : scriptFn;

  try {
    console.log(
      "📞 Placing Twilio call to:",
      phoneNumber,
      "using script:",
      scriptKey
    );

    const call = await client.calls.create({
      to: phoneNumber,
      from: callerId,
      // Simple TwiML that reads your script out loud
      twiml: `<Response><Say>${scriptText}</Say></Response>`
    });

    console.log("✅ Twilio call created:", call.sid);
    return call.sid;
  } catch (err) {
    console.error("Twilio call error in makeCall:", err);
    throw err;
  }
}
