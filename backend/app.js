//-----------------------------------------------------
// backend/app.js  (clean: no hard-coded “Press 1” TwiML)
//-----------------------------------------------------
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { makeCall } from "../twilioService.js"; // note: ../ because app.js is in /backend

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 5000;

// Health check
app.get("/", (req, res) => {
  res.send("✅ AI Sales Agent backend is running");
});

// Brevo/Zapier webhook -> places an outbound call via makeCall()
app.post("/brevo/webhook", async (req, res) => {
  try {
    // Try all common Brevo/Zapier shapes
    const body = req.body || {};
    const contact = body.contact || {};
    const attrs =
      body.attributes ||
      contact.attributes ||
      {};

    const phone =
      attrs.SMS ||
      attrs.PHONE ||
      attrs.Mobile ||
      body.phone ||
      contact.phone ||
      null;

    const first = (attrs.FIRSTNAME || attrs.FirstName || "Friend").toString().trim();

    if (!phone) {
      console.warn("⚠️ No phone number found in payload.");
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
