import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getAIResponse(prompt) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a confident and upbeat sales agent who tries to build rapport quickly and book a meeting within two minutes." },
        { role: "user", content: prompt },
      ],
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI error:", error);
    throw error;
  }
}
