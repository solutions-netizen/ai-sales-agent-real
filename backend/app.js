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
    const phone = req.body?.attributes?.SMS;
    const first = req.body?.attributes?.FIRSTNAME || "Friend";

    if (!phone) {
      console.warn("⚠️ No phone number found in Brevo payload.");
      return res.status(400).send("Missing phone number");
    }

    const call = await client.calls.create({
      to: phone,
      from: TWILIO_FROM_NUMBER,
      // Pass first name in the query string so Twilio can greet properly
      url: `${BASE_URL}/twiml/outbound?name=${encodeURIComponent(first)}`,
      record: false
    });

    console.log(`📞 Triggered Twilio call to ${phone} for ${first} | SID: ${call.sid}`);
    res.status(200).send({ status: "ok" });
  } catch (err) {
    console.error("❌ Error in /brevo/webhook:", err);
    res.status(500).send("Server error");
  }
});

// === Initial Call Script ===
app.post("/twiml/outbound", (req, res) => {
  // Default to “Friend” if no name provided
  const name = req.query.name || "Friend";
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
    // Example: connect to a live person or voicemail
    twiml.say("Please hold while we connect you.");
    twiml.dial("+1YOUR_PHONE_NUMBER_HERE");
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
