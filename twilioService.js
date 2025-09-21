import { getAIResponse } from "./gptService.js";
import { callScripts } from "./scripts.js";
import twilio from "twilio";
import dotenv from "dotenv";

// ----------------------------------------------------
//  Load environment variables
// ----------------------------------------------------
dotenv.config();

console.log("Twilio Service starting with:");
console.log("SID:", process.env.TWILIO_ACCOUNT_SID ? "Loaded ✅" : "Missing ❌");
console.log("TOKEN:", process.env.TWILIO_AUTH_TOKEN ? "Loaded ✅" : "Missing ❌");
console.log("FROM:", process.env.TWILIO_PHONE_NUMBER ? "Loaded ✅" : "Missing ❌");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ----------------------------------------------------
//  makeCall
//  Places an outbound call that greets the contact
//  by FIRST NAME ONLY—never speaks a phone number.
// ----------------------------------------------------
export async function makeCall(toNumber, callType, "Andrea") {
  try {
    // Clean the first name: letters, spaces, apostrophes, hyphens only
    const safeName = (firstName || 'friend')
      .replace(/[^a-zA-Z\s'-]/g, '')
      .trim();

    // Build a GPT prompt that politely greets by first name only
    const prompt =
      callScripts[callType] ||
      `Introduce yourself as a sales agent in a polite and professional way and greet ${safeName} by first name only. Do NOT include any phone numbers.`;

    console.log("Using prompt for callType:", callType);
    console.log("Prompt text:", prompt);

    // Ask GPT for the spoken script
    const aiReplyRaw = await getAIResponse(prompt);
    console.log("GPT returned reply:", aiReplyRaw);

    // Extra safety: strip any digits that might sneak through
    const aiReply = aiReplyRaw.replace(/\d+/g, '').trim();

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
