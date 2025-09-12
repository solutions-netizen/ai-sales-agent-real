import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";

import { makeCall } from "./services/twilioService.js";   // Twilio helper
import brevoRouter from "./services/brevoService.js";     // Brevo webhook handler

// Load environment variables from .env
dotenv.config();

const app = express();
app.use(bodyParser.json());

// Mount Brevo routes under /brevo
app.use("/brevo", brevoRouter);

// Simple health check (useful to test ngrok URL in a browser)
app.get("/", (req, res) => {
  res.send("✅ AI Sales Agent Backend is Running with Twilio + Brevo");
});

// Route to manually trigger a test call
app.post("/make-call", async (req, res) => {
  try {
    const { phoneNumber, callType } = req.body;

    if (!phoneNumber || !callType) {
      return res
        .status(400)
        .json({ error: "Phone number and callType required" });
    }

    const call = await makeCall(phoneNumber, callType);
    res.json({ success: true, call });
  } catch (error) {
    console.error("Error making call:", error);
    res.status(500).json({ error: "Failed to make call" });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

