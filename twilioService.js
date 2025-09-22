export async function makeCall(toNumber, callType, firstName = '') {
  try {
    // --- Clean the first name to avoid any numbers or symbols ---
    const safeName = (firstName || 'friend')
      .replace(/[^a-zA-Z\s'-]/g, '')
      .trim();

    // --- Build a GPT prompt that NEVER includes a phone number ---
    const prompt =
      callScripts[callType] ||
      `Introduce yourself as a sales agent in a polite and professional way and greet ${safeName} by first name only. Do NOT include any phone numbers.`;

    console.log("Using prompt for callType:", callType);
    console.log("Prompt text:", prompt);

    // --- TEMPORARY TEST: hard-code the greeting to rule out GPT ---
const aiReply = "Hello friend. This is a test message.";

    // --- Place the call with Twilio ---
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
