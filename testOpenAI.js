import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

console.log("Loaded API key (first 10 chars only):", process.env.OPENAI_API_KEY?.slice(0, 10));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testGPT() {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a test bot." },
        { role: "user", content: "Say hello in 5 words or less." },
      ],
    });

    console.log("GPT reply:", response.choices[0].message.content);
  } catch (error) {
    console.error("Error from OpenAI:", error.message);
  }
}

testGPT();
