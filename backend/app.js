// backend/app.js  — ES module version
import express from "express";
import bodyParser from "body-parser";
import twilioPkg from "twilio";

const app = express();
app.use(bodyParser.json());

const {
  PORT = 5000,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  BASE_URL
} = process.env;

// ✅ Twilio client
const client = twilioPkg(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/**
 * Webhook from Zapier → makes outbound call
 */
app.post("/brevo/webhook", async (req, res) => {
  try {
    console.log("=== RAW BREVO WEBHOOK BODY START ===");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("=== RAW BREVO WEBHOOK BODY END ===");

    const phone = req.body.attributes?.SMS;
    const callType = req.body.callType || "default";

    if (!phone) {
      console.warn("⚠️ No phone number found in Brevo payload.");
      return res.status(400).send("Missing phone number");
    }

    if (!BASE_URL) {
      console.error("⚠️ Missing BASE_URL environment variable");
      return res.status(500).send("Missing BASE_URL");
    }

    const twimlUrl = `${BASE_URL}/twiml/outbound?callType=${encodeURIComponent(
      callType
    )}`;

    console.log(`📞 Triggering Twilio ${callType} call to ${phone}`);
    const call = await client.calls.create({
      to: phone,
      from: TWILIO_FROM_NUMBER,
      url: twimlUrl
    });
    console.log(`✅ Twilio call SID: ${call.sid}`);

    res.status(200).send({ ok: true });
  } catch (err) {
    console.error("❌ Error in /brevo/webhook:", err);
    res.status(500).send("Server error");
  }
});

/**
 * TwiML instructions for the outbound call
 * This is where you branch the dialogue (“if this then that”)
 */
app.post("/twiml/outbound", (req, res) => {
  try {
    const callType = req.query.callType || "default";
    const voiceResponse = new twilioPkg.twiml.VoiceResponse();

    // Simple branching example
    if (callType === "cold-call") {
      const gather = voiceResponse.gather({
        numDigits: 1,
        action: "/twiml/menu",
        method: "POST"
      });
      gather.say(
        "Hello, this is Living Life Resources calling with important financial information. " +
        "Press 1 if you would like to schedule a call back. Press 2 to decline."
      );
      voiceResponse.say(
        "We did not receive any input. Goodbye and have a wonderful day."
      );
    } else {
      voiceResponse.say(
        "Hello from Living Life Resources. This is a default message. Goodbye."
      );
    }

    res.type("text/xml");
    res.send(voiceResponse.toString());
  } catch (err) {
    console.error("❌ Error in /twiml/outbound:", err);
    res.status(500).send("Server error");
  }
});

/**
 * Example menu route if user presses a key
 */
app.post("/twiml/menu", (req, res) => {
  const digits = req.body.Digits;
  const voiceResponse = new twilioPkg.twiml.VoiceResponse();

  if (digits === "1") {
    voiceResponse.say("Great! We will call you back shortly. Goodbye.");
  } else if (digits === "2") {
    voiceResponse.say("No problem. Thank you for your time. Goodbye.");
  } else {
    voiceResponse.say("Invalid input. Goodbye.");
  }
