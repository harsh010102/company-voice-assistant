// Vercel serverless function: POST /api/chat
// Body: { messages: [{ role: "user" | "assistant", content: string }, ...] }
// Returns: { reply: string, provider: string }
//
// Resilience: tries Gemini first, then falls back through other models/providers
// so an intermittent 503 ("high demand") never takes the assistant down.
// All API keys live here as env vars — never shipped to the browser.

import { SYSTEM_PROMPT, KNOWLEDGE } from './_knowledge.js';

const SYSTEM_TEXT = `${SYSTEM_PROMPT}\n\n${KNOWLEDGE}`;
const GEN = { temperature: 0.3, maxTokens: 600 };

// ---- Provider callers. Each returns a non-empty string, or throws. ----

async function callGemini(model, contents) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('no GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_TEXT }] },
      contents,
      generationConfig: { temperature: GEN.temperature, maxOutputTokens: GEN.maxTokens },
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`gemini ${model} ${r.status}: ${data?.error?.status || ''}`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
  if (!text) throw new Error(`gemini ${model} empty`);
  return text;
}

async function callOpenAICompatible(label, url, key, model, messages) {
  if (!key) throw new Error(`no key for ${label}`);
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: GEN.temperature, max_tokens: GEN.maxTokens }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${label} ${r.status}`);
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${label} empty`);
  return text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const { messages = [] } = req.body || {};
  const clean = messages.filter((m) => m && typeof m.content === 'string' && m.content.trim());
  if (clean.length === 0) {
    res.status(400).json({ error: 'No message provided.' });
    return;
  }

  // Two shapes of the same conversation: Gemini "contents" and OpenAI "messages".
  const geminiContents = clean.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const openaiMessages = [
    { role: 'system', content: SYSTEM_TEXT },
    ...clean.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
  ];

  // Fallback chain, in order. Gemini first (reliable + free), others as backups.
  const chain = [
    { name: 'gemini:flash-lite-latest', run: () => callGemini('gemini-flash-lite-latest', geminiContents) },
    { name: 'gemini:3.5-flash', run: () => callGemini('gemini-3.5-flash', geminiContents) },
    {
      name: 'openrouter:llama-3.3-70b',
      run: () =>
        callOpenAICompatible(
          'openrouter',
          'https://openrouter.ai/api/v1/chat/completions',
          process.env.OPENROUTER_API_KEY,
          'meta-llama/llama-3.3-70b-instruct',
          openaiMessages,
        ),
    },
    {
      name: 'nvidia:llama-3.2-90b',
      run: () =>
        callOpenAICompatible(
          'nvidia',
          'https://integrate.api.nvidia.com/v1/chat/completions',
          process.env.NVIDIA_API_KEY,
          'meta/llama-3.2-90b-vision-instruct',
          openaiMessages,
        ),
    },
  ];

  const errors = [];
  for (const step of chain) {
    try {
      const reply = await step.run();
      res.status(200).json({ reply, provider: step.name });
      return;
    } catch (e) {
      errors.push(`${step.name}: ${e.message}`);
    }
  }

  res.status(502).json({ error: 'All providers failed', detail: errors });
}
