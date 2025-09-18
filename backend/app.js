import express from "express";
import bodyParser from "body-parser";
import twilioPkg from "twilio";

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  BASE_URL
} = process.env;

const client = twilioPkg(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const VoiceResponse = twilioPkg.twiml.VoiceResponse;

// === Triggered by Zapier ===
app.post("/brevo/webhook", async (req, res) => {
  try {
    const attrs = req.body?.attributes || {};
    const phone = attrs.SMS;
    // Only use FIRSTNAME (or “Friend”) for greeting
    const first = attrs.FIRSTNAME?.trim() || "Friend";

    if (!phone) {
      console.warn("⚠️ No phone number found in Brevo payload.");
      return res.status(400).send("Missing phone number");
    }

    const call = await client.calls.create({
      to: phone,
      from: TWILIO_FROM_NUMBER,
      // Pass ONLY the first name in the query string
      url: `${BASE_URL}/twiml/outbound?first=${encodeURIComponent(first)}`,
      record: false
    });

    console.log(`📞 Triggered Twilio call to ${phone} for first name: ${first}`);
    res.status(200).send({ status: "ok" });
  } catch (err) {
    console.error("❌ Error in /brevo/webhook:", err);
    res.status(500).send("Server error");
  }
});

// === Initial Call Script ===
app.post("/twiml/outbound", (req, res) => {
  // ONLY read the first name, never the phone
  const name = req.query.first || "Friend";
  const twiml = new VoiceResponse();

  const gather = twiml.gather({
    numDigits: 1,
    action: "/twiml/gather",
    method: "POST",
    timeout: 5
  });
  gather.say(
    `Hello ${name}, this is Living Life Resources.
     Press 1 to confirm your appointment.
     Press 2 to reschedule.
     Press 3 to speak with a representative.`
  );

  twiml.say("We did not receive a response. Goodbye.");

  res.type("text/xml");
  res.send(twiml.toString());
});

// === Branch Logic ===
app.post("/twiml/gather", (req, res) => {
  const digit = req.body.Digits;
  const twiml = new VoiceResponse();

  if (digit === "1") {
    twiml.say("Thank you. Your appointment is confirmed.");
  } else if (digit === "2") {
    twiml.say("We will reach out to reschedule. Thank you.");
  } else if (digit === "3") {
    twiml.say("Please hold while we connect you.");
    twiml.dial("+1YOUR_PHONE_NUMBER_HERE"); // replace with your number if desired
  } else {
    twiml.say("Invalid input. Goodbye.");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// === Start Server ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
