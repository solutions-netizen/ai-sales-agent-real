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

// --- Brevo/Zapier webhook: receive lead and trigger call ---
app.post("/brevo/webhook", async (req, res) => {
  try {
    console.log("=== RAW BREVO WEBHOOK BODY START ===");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("=== RAW BREVO WEBHOOK BODY END ===");

    const phone = req.body?.attributes?.SMS;
    const first = req.body?.attributes?.FIRSTNAME || "Friend";

    if (!phone) {
      console.warn("⚠️ No phone number found in Brevo payload.");
      return res.status(400).send("Missing phone number");
    }

    const call = await client.calls.create({
      to: phone,
      from: TWILIO_FROM_NUMBER,
      url: `${BASE_URL}/twiml/outbound?name=${encodeURIComponent(first)}`,
      record: false   // set to true if you want full call recordings
    });

    console.log(`📞 Triggered Twilio call to ${phone} | SID: ${call.sid}`);
    res.status(200).send({ status: "ok" });
  } catch (err) {
    console.error("❌ Error in /brevo/webhook:", err);
    res.status(500).send("Server error");
  }
});

// --- TwiML route: what Twilio says during the call ---
app.post("/twiml/outbound", (req, res) => {
  const name = req.query.name || "Friend";
  const twiml = new VoiceResponse();

  // Greeting + Gather
  const gather = twiml.gather({
    numDigits: 1,
    action: "/twiml/gather",
    method: "POST",
    timeout: 5
  });
  gather.say(
    `Hello ${name}, this is Living Life Resources calling. 
     Press 1 to confirm your appointment. 
     Press 2 to reschedule.`
  );

  // If no key pressed
  twiml.say(
    "We did not receive a response. Please call us back at your convenience. Goodbye."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

// --- TwiML branch handler ---
app.post("/twiml/gather", (req, res) => {
  const digit = req.body.Digits;
  const twiml = new VoiceResponse();

  if (digit === "1") {
    twiml.say("Thank you. Your appointment is confirmed.");
  } else if (digit === "2") {
    twiml.say("We will reach out to reschedule. Thank you.");
  } else {
    twiml.say("Invalid input. Goodbye.");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// --- Start server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
