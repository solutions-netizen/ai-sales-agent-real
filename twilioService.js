import { getAIResponse } from "./gptService.js";
import { callScripts } from "./scripts.js";
import twilio from "twilio";
import dotenv from "dotenv";

// Load env values
dotenv.config();

console.log("Twilio Service starting with:");
console.log("SID:", process.env.TWILIO_ACCOUNT_SID ? "Loaded ✅" : "Missing ❌");
console.log("TOKEN:", process.env.TWILIO_AUTH_TOKEN ? "Loaded ✅" : "Missing ❌");
console.log("FROM:", process.env.TWILIO_PHONE_NUMBER ? "Loaded ✅" : "Missing ❌");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function makeCall(toNumber, callType) {
  try {
    // Get the correct script or fallback
    const prompt =
      callScripts[callType] ||
      "Introduce yourself as a sales agent in a polite and professional way.";

    console.log("Using prompt for callType:", callType);
    console.log("Prompt text:", prompt);

    // Ask GPT for the spoken script
    const aiReply = await getAIResponse(prompt);
    console.log("GPT returned reply:", aiReply);

    // Place the call with Twilio
    const call = await client.calls.create({
      twiml: `<Response><Say voice="alice">${aiReply}</Say></Response>`,
      to: toNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    console.log("Twilio API response:", call);
    return call;
  } catch (error) {
    console.error("Twilio call error:", error);
    throw error;
  }
}
