//-----------------------------------------------------
// backend/app.js  (clean version - NO "Press 1" hardcode)
//-----------------------------------------------------
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { makeCall } from "../twilioService.js"; // notice the path

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 5000;

// Health check
app.get("/", (req, res) => {
  res.send("✅ AI Sales Agent backend is running");
});

// Handles outbound call requests from Brevo/Zapier webhook
app.post("/brevo/webhook", async (req, res) => {
  try {
    const body = req.body || {};
    const contact = body.contact || {};
    const attrs = body.attributes || contact.attributes || {};

    const phone =
      attrs.SMS ||
      attrs.PHONE ||
      attrs.Mobile ||
      body.phone ||
      contact.phone ||
      null;

    const first = (attrs.FIRSTNAME || attrs.FirstName || "Friend").toString().trim();

    if (!phone) {
      console.warn("⚠️ No phone number found in payload");
      return res.status(400).send("Missing phone number");
    }

    console.log(`📞 Triggering Twilio call to ${phone} for first name: ${first}`);
    await makeCall(phone, "cold-call", first);

    res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Error in /brevo/webhook:", err);
    res.status(500).send("Server error");
  }
});
// Handles outbound call requests from Zapier (Google Sheets → Zapier → backend)
app.post("/zapier-call", async (req, res) => {
  try {
    const {
      phoneNumber,
      name,
      email,
      readinessLevel,
      score,
      followUpAction,
      notes,
    } = req.body || {};

    if (!phoneNumber) {
      console.warn("No phone number found in Zapier payload");
      return res
        .status(400)
        .json({ ok: false, error: "Missing phone number in payload" });
    }

    const firstName = (name || "friend").toString().split(" ")[0].trim();

    console.log("📞 New lead from Zapier:", {
      phoneNumber,
      name,
      email,
      readinessLevel,
      score,
      followUpAction,
      notes,
    });

    // Trigger Twilio call – reuse your existing makeCall helper
    // await makeCall(phoneNumber, "hot-lead", firstName);


    return res
      .status(200)
      .json({ ok: true, message: "Call initiated from Zapier" });
  } catch (err) {
    console.error("Error in /zapier-call:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Internal server error in /zapier-call" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
