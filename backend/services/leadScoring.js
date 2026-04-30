// backend/services/leadScoring.js
// AI-assisted lead scoring tuned for life insurance sales.
// Score 0–100 reflecting how ready/qualified a lead is.

import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

let _openai;
function getClient() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) return null;
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function scoreLead(data) {
  const {
    age, health_rating, tobacco_use, coverage_amount,
    monthly_budget, product_interest, beneficiary, phone, email,
  } = data;

  // Rule-based baseline (fast, always works)
  let score = 40;
  const reasons = [];

  if (phone)  { score += 10; reasons.push("has phone"); }
  if (email)  { score += 5;  reasons.push("has email"); }
  if (age && age >= 25 && age <= 55) { score += 10; reasons.push("prime insurable age"); }
  if (age && (age < 25 || age > 65)) { score -= 5; }
  if (health_rating === "excellent") { score += 10; reasons.push("excellent health"); }
  if (health_rating === "good")      { score += 7; }
  if (health_rating === "fair")      { score += 2; }
  if (health_rating === "poor")      { score -= 5; }
  if (tobacco_use)                   { score -= 8;  reasons.push("tobacco user (higher premium)"); }
  if (coverage_amount >= 250000)     { score += 8;  reasons.push("significant coverage need"); }
  if (monthly_budget >= 100)         { score += 8;  reasons.push("stated budget over $100/mo"); }
  if (beneficiary === "spouse" || beneficiary === "children") {
    score += 7; reasons.push("family beneficiary (high motivation)");
  }
  if (product_interest === "iul")    { score += 5;  reasons.push("IUL interest (wealth-building focus)"); }

  score = Math.min(100, Math.max(0, score));

  // If OpenAI is available, enrich the reason text
  let reason = reasons.join("; ") || "Standard lead";
  const client = getClient();
  if (client) {
    try {
      const prompt = `
You are an expert life insurance sales coach. Score this lead's readiness 0-100 and write a 1-sentence coaching tip for the agent.

Lead data:
- Age: ${age || "unknown"}
- Health: ${health_rating || "unknown"}
- Tobacco: ${tobacco_use ? "yes" : "no"}
- Coverage needed: $${coverage_amount || "unknown"}
- Monthly budget: $${monthly_budget || "unknown"}/mo
- Product interest: ${product_interest || "unknown"}
- Has phone: ${phone ? "yes" : "no"}
- Has email: ${email ? "yes" : "no"}
- Beneficiary: ${beneficiary || "unknown"}

Rule-based score: ${score}/100

Respond in this exact JSON format only:
{"score": <number 0-100>, "reason": "<one sentence coaching tip for the agent>"}
`;
      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.3,
      });
      const parsed = JSON.parse(resp.choices[0].message.content.trim());
      // Blend AI score with rule score (60/40 weight)
      score = Math.round(parsed.score * 0.6 + score * 0.4);
      reason = parsed.reason;
    } catch (_) {
      // Fall back to rule-based
    }
  }

  return { score, reason };
}
