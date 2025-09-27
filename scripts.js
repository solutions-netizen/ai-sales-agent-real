// scripts.js
// -------------------------------------------------------------------
// Call scripts for the AI Sales Agent
// -------------------------------------------------------------------

// You can add more keys (like "follow-up") later if needed.
// Use {{firstName}} exactly—our Node code replaces it at runtime.

export const callScripts = {
  "cold-call": `
Hi {{firstName}}, this is Andrea with Living Life Resources.
You recently showed interest in protecting your family with an
affordable insurance plan, and I’d love to share a quick option.
Press 1 to schedule a free consultation,
Press 2 to receive a text with details,
Press 3 if you'd rather not receive future calls.
`
};
