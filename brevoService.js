import express from "express";
import { makeCall } from "./twilioService.js";   // adjust path if needed

const router = express.Router();

router.post("/webhook", async (req, res) => {
  console.log("=== RAW BREVO WEBHOOK BODY START ===");
  console.dir(req.body, { depth: null });
  console.log("=== RAW BREVO WEBHOOK BODY END ===");

  try {
    // Always reply quickly so Brevo knows we received the webhook
    res.status(200).send("ok");

    const body = req.body || {};
    const contact = body.contact || {};

    // Extract phone number from every likely spot
    const phone =
      contact.attributes?.PHONE ||
      contact.attributes?.Mobile ||
      contact.phone ||
      body.attributes?.SMS ||
      body.phone ||
      null;

    // Extract first name if present
    const firstName =
      contact.attributes?.FIRSTNAME ||
      contact.attributes?.FirstName ||
      contact.firstName ||
      body.attributes?.FIRSTNAME ||
      body.firstName ||
      "";

    if (!phone) {
      console.warn("⚠️ No phone number found in Brevo payload.");
      return;
    }

    console.log(
      `📞 Triggering Twilio call to ${phone} using GPT script (name: ${firstName || "none"})`
    );

    // ✅ Pass the first name as the third argument so Twilio can greet correctly
    await makeCall(phone, "cold-call", firstName);

  } catch (err) {
    console.error("❌ Error in Brevo webhook:", err);
  }
});

export default router;
