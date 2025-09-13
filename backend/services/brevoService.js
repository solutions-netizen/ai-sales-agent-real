import express from "express";
import { makeCall } from "./twilioService.js";   // adjust path only if twilioService.js is in a different folder

const router = express.Router();

router.post("/webhook", async (req, res) => {
  // Log everything so you can still see the full payload in Render
  console.log("=== RAW BREVO WEBHOOK BODY START ===");
  console.dir(req.body, { depth: null });
  console.log("=== RAW BREVO WEBHOOK BODY END ===");

  try {
    // Always ACK quickly so Brevo doesn’t retry
    res.status(200).send("ok");

    // Pull the contact object if it exists
    const contact = req.body?.contact || {};

    // Find a phone number (Brevo can store it in several places)
    const phone =
      contact.attributes?.PHONE ||
      contact.attributes?.Mobile ||
      contact.phone ||
      req.body.phone ||
      null;

    if (!phone) {
      console.warn("⚠️ No phone number found in Brevo contact.");
      return;
    }

    console.log(`📞 Triggering Twilio call to ${phone} using GPT script`);
    await makeCall(phone, "cold-call");

  } catch (err) {
    console.error("❌ Error in Brevo webhook:", err);
  }
});

export default router;
