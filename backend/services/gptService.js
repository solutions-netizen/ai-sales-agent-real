// backend/services/gptService.js
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

let openai;
function getClient() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

const AGENT_NAME  = process.env.AGENT_NAME  || "Andrea Edwards";
const AGENCY_NAME = process.env.AGENCY_NAME || "Living Life Resources";

function fillTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// Generate a spoken call script via GPT
export async function getCallScript(scriptTemplate, vars = {}) {
  const filled = fillTemplate(scriptTemplate, {
    agentName: AGENT_NAME,
    agencyName: AGENCY_NAME,
    touchNumber: "2",
    ...vars,
  });

  const resp = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a professional life insurance AI phone assistant. " +
          "Write a natural, spoken script for a real phone call. " +
          "Max 60 words. Warm, conversational tone. " +
          "NEVER include phone numbers, URLs, or digits in the script.",
      },
      { role: "user", content: filled },
    ],
    max_tokens: 150,
    temperature: 0.7,
  });

  let script = resp.choices[0].message.content.trim();
  script = script.replace(/\d+[\d\-\(\)\s\.]{6,}/g, "").trim();
  return script;
}

// Generate an SMS message via GPT
export async function getSMSMessage(prompt, vars = {}) {
  const filled = fillTemplate(prompt, {
    agentName: AGENT_NAME,
    agencyName: AGENCY_NAME,
    ...vars,
  });

  const resp = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You write short, friendly SMS messages for a life insurance agent. " +
          "Max 160 characters. Conversational, no jargon. Include a clear call-to-action. " +
          "NEVER include URLs unless a {{link}} placeholder is in the prompt.",
      },
      { role: "user", content: filled },
    ],
    max_tokens: 80,
    temperature: 0.7,
  });

  return resp.choices[0].message.content.trim();
}

// Qualify a lead via conversational AI (for chat widget)
export async function qualifyLeadChat(conversationHistory, leadData = {}) {
  const systemPrompt = `
You are ${AGENT_NAME}'s AI assistant at ${AGENCY_NAME}, a life insurance agency.
Your job is to qualify leads by asking friendly questions about their insurance needs.
Ask ONE question at a time. Be warm and conversational, not clinical.
Key info to gather: age, health, tobacco use, coverage amount needed, monthly budget, beneficiary.
Once you have enough info (3+ answers), summarize what you've learned and say the agent will be in touch shortly.
Keep responses under 2 sentences.
Current lead info: ${JSON.stringify(leadData)}
`;

  const resp = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
    ],
    max_tokens: 100,
    temperature: 0.7,
  });

  return resp.choices[0].message.content.trim();
}
