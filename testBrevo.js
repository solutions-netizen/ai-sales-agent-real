import dotenv from "dotenv";
import fetch from "node-fetch";


dotenv.config();

async function testBrevo() {
  try {
    const response = await fetch("https://api.brevo.com/v3/account", {
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    console.log("✅ Brevo API key works!");
    console.log("Brevo account info:", data);
  } catch (error) {
    console.error("❌ Brevo API test failed:", error);
  }
}

testBrevo();
