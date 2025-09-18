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

// ✅ Correct Twilio client for ES modules
const client = twilioPkg(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);


// ===== Helper Functions =====
function logBlock(title, data) {
  console.log(`\n=== ${title} START ===`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
  console.log(`=== ${title} END ===\n`);
}
function isE164(num) {
  return typeof num === "string" && /^\+\d{8,15}$/.test(num);
}

// ===== Health Check =====
app.get("/", (_req, res) => {
  res.send("AI Sales Agent server is up ✅");
});

// ===== TwiML Outbound Call =====
// Twilio calls this AFTER the call connects to know what to say/do.
app.post("/twiml/outbound", (req, res) => {
  const first = req.query.first || "friend";
  const vr = new twilio.twiml.VoiceResponse();

  // Greeting and menu
  vr.say({ voice: "Polly.Joanna" },
    `Hi ${first}, this is Living Life Resources calling about your financial wellness session.`);

  vr.say({ voice: "Polly.Joanna" },
    "Press 1 to confirm your appointment. Press 2 to reschedule. " +
    "Or press 3 to speak with a team member.");

  // Gather one key press
  vr.gather({
    input: "dtmf",
    numDigits: 1,
    action: "/twilio/gather",
    method: "POST"
  });

  // If nothing pressed, go to fallback
  vr.redirect("/twilio/fallback");

  res.type("text/xml").send(vr.toString());
});

// ===== Handle Key Press =====
app.post("/twilio/gather", (req, res) => {
  const digit = req.body.Digits || "";
  const vr = new twilio.twiml.VoiceResponse();

  switch (digit) {
    case "1":
      vr.say({ voice: "Polly.Joanna" },
        "Great! Your appointment is confirmed. We’ll text you the details shortly.");
      break;
    case "2":
      vr.say({ voice: "Polly.Joanna" },
        "No problem. We’ll text you a link so you can pick a better time.");
      break;
    case "3":
      vr.say({ voice: "Polly.Joanna" },
        "Connecting you to a team member now, please hold.");
      vr.dial("+1YOUR_TEAM_NUMBER"); // replace with your team number if desired
      break;
    default:
      vr.say({ voice: "Polly.Joanna" },
        "Sorry, I didn’t catch that. We’ll follow up by text.");
      break;
  }

  res.type("text/xml").send(vr.toString());
});

// ===== Fallback (voicemail / no key press) =====
app.post("/twilio/fallback", (_req, res) => {
  const vr = new twilio.twiml.VoiceResponse();
  vr.say({ voice: "Polly.Joanna" },
    "We missed you, but that’s okay. We’ll text you with next steps. Have a great day!");
  res.type("text/xml").send(vr.toString());
});

// ===== Zapier Webhook =====
// Triggered when a new row is added in Google Sheets.
app.post("/brevo/webhook", async (req, res) => {
  try {
    logBlock("RAW BREVO WEBHOOK BODY", req.body);

    const attrs = req.body.attributes || {};
    const callType = req.body.callType || "cold-call";

    const phone = (attrs.SMS || attrs.PHONE || "").trim();
    const first = (attrs.FIRSTNAME || "Friend").trim();
    const email = (attrs.EMAIL || "").trim();

    if (!isE164(phone)) {
      console.error("Invalid phone number");
      return res.status(400).json({ ok: false, error: "Invalid phone number" });
    }
    if (!BASE_URL) {
      console.error("Missing BASE_URL environment variable");
      return res.status(500).json({ ok: false, error: "Missing BASE_URL" });
    }

    console.log(`📞 Triggering Twilio ${callType} call to ${phone}`);

    const call = await client.calls.create({
      to: phone,
      from: TWILIO_FROM_NUMBER,
      url: `${BASE_URL}/twiml/outbound?first=${encodeURIComponent(first)}`,
      record: true // records the entire call
    });

    console.log(`✅ Twilio call SID: ${call.sid}`);

    // Optional follow-up SMS
    try {
      await client.messages.create({
        to: phone,
        from: TWILIO_FROM_NUMBER,
        body: `Hi ${first}, this is Living Life Resources. We’ll call again soon if we missed you. Reply STOP to opt out.`
      });
      console.log("✉️ SMS sent");
    } catch (err) {
      console.warn("SMS send failed (non-fatal):", err.message);
    }

    res.json({ ok: true, callSid: call.sid });
  } catch (err) {
    console.error("❌ Error in /brevo/webhook:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
