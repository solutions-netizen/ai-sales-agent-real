import express from "express";
import { makeCall } from "./twilioService.js";   // adjust path only if your twilioService.js is in a different folder

const router = express.Router();

router.post("/webhook", async (req, res) => {
  // === TOP-LEVEL LOG TO SEE THE ENTIRE PAYLOAD ===
  console.log("=== RAW BREVO WEBHOOK BODY START ===");
  console.dir(req.body, { depth: null });
  console.log("=== RAW BREVO WEBHOOK BODY END ===");

  try {
    // Always ACK quickly so Brevo doesn’t retry
    res.status(200).send("ok");

    // Pull the contact object if it exists
    const contact = req.body?.contact || {};

    // ---- TEMPORARY: very loose check so we can still trigger calls ----
    // We will tighten this once we know the exact property Brevo sends.
    // This simply logs whatever lists we can find.
    const possibleLists =
      contact.listNames ||
      contact.listIds ||
      req.body.listNames ||
      req.body.listIds ||
      [];

    console.log("Possible list data from Brevo:", possibleLists);

    // Replace this with a proper check after you see the actual payload.
    // For now, if *any* list info exists, attempt a call.
    if (!possibleLists || (Array.isArray(possibleLists) && possibleLists.length === 0)) {
      console.log("⚠️ No list information found — skipping call for now.");
      return;
    }

    // Find a phone number (Brevo can put it in several places)
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
