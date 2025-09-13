import express from "express";
import { makeCall } from "./twilioService.js";   // adjust path if needed

const router = express.Router();

router.post("/webhook", async (req, res) => {
  console.log("=== RAW BREVO WEBHOOK BODY START ===");
  console.dir(req.body, { depth: null });
  console.log("=== RAW BREVO WEBHOOK BODY END ===");

  try {
    res.status(200).send("ok");

    // Brevo sends attributes at the top level in this payload
    const body = req.body || {};
    const contact = body.contact || {};

    // Look for a phone number in every likely spot, including attributes.SMS
    const phone =
      contact.attributes?.PHONE ||
      contact.attributes?.Mobile ||
      contact.phone ||
      body.attributes?.SMS ||   // 👈 added this line
      body.phone ||
      null;

    if (!phone) {
      console.warn("⚠️ No phone number found in Brevo payload.");
      return;
    }

    console.log(`📞 Triggering Twilio call to ${phone} using GPT script`);
    await makeCall(phone, "cold-call");

  } catch (err) {
    console.error("❌ Error in Brevo webhook:", err);
  }
});

export default router;
