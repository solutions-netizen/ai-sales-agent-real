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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
