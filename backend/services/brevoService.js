import express from "express";
import { makeCall } from "./twilioService.js";

const router = express.Router();

// This is the endpoint Brevo will call
router.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Brevo webhook received:", JSON.stringify(req.body, null, 2));

    // Always ACK quickly so Brevo doesn't retry
    res.status(200).send("ok");

    // Extract contact + tags
    const contact = req.body?.contact || {};
    const tags = (contact.tags || []).map(t => t.toLowerCase());

    // Only trigger a call if tag includes "interested"
    if (!tags.includes("interested")) {
      console.log("Contact is missing 'interested' tag — skipping call.");
      return;
    }

    // Find a phone number (Brevo stores it under attributes or contact fields)
    const phone =
      contact.attributes?.PHONE ||
      contact.attributes?.Mobile ||
      contact.phone ||
      null;

    if (!phone) {
      console.warn("⚠️ No phone number found in Brevo contact.");
      return;
    }

    console.log(`📞 Triggering Twilio call to ${phone} using GPT script`);

    // Use your existing Twilio+GPT makeCall function
    await makeCall(phone, "cold-call");

  } catch (err) {
    console.error("❌ Error in Brevo webhook:", err);
  }
});

export default router;
