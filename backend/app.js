import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { makeCall } from "./services/twilioService.js";
import brevoRouter from "./services/brevoService.js";

// Load environment variables from .env (local dev only)
dotenv.config();

const app = express();
app.use(bodyParser.json());

// Mount the Brevo webhook router
app.use("/brevo", brevoRouter);

// Simple health-check route
app.get("/", (req, res) => {
  res.send("AI Sales Agent Backend Running ✅ with Twilio");
});

// Manual call trigger (optional)
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

// ---- Start server ----
const PORT = process.env.PORT || 5000;
// Listen on all network interfaces so Render can reach it
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running and listening on port ${PORT}`);
});
