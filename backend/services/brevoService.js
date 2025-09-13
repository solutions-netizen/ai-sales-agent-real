import express from "express";
import { makeCall } from "../services/twilioService.js"; // adjust path if needed

const router = express.Router();

router.post("/webhook", async (req, res) => {
  try {
  console.log("FULL BREVO BODY ===>", JSON.stringify(req.body, null, 2));
  console.log("📩 Brevo webhook received:", JSON.stringify(req.body, null, 2));
    res.status(200).send("ok");

    const contact = req.body?.contact || {};
    // If your payload uses listIds instead of listNames, swap this line accordingly.
    const lists = (contact.listNames || []).map(l => l.toLowerCase());

    if (!lists.includes("interested")) {
      console.log("Contact is not in 'interested' list — skipping call.");
      return;
    }

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
    await makeCall(phone, "cold-call");

  } catch (err) {
    console.error("❌ Error in Brevo webhook:", err);
  }
});

export default router;
