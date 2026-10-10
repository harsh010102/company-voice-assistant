# Company Analysis Voice Assistant

A small web app that answers spoken or typed questions about two companies, Mensch und Maschine and Tyson Foods, using only the documents that came with the assignment.

**Live:** https://voice-app-lilac.vercel.app

Open it in Chrome or Edge, allow the microphone, then press the mic button or just type.

## What it does

You ask something like "What does Tyson Foods do?" and it answers out loud. It remembers the conversation, so a follow-up like "what were their sales last year?" stays on Tyson, and "tell me about the other one" switches over to Mensch und Maschine. If you ask something that could apply to either company before it has any context, it asks which one you mean.

It will talk about products, business segments, competitive strengths, and how each company is doing. On money, it only gives revenue and forward guidance. It refuses profit, margins, salaries, contract sizes, and customer names. That restriction comes straight from the brief, so it's deliberate, not a gap. When the answer isn't in the documents, it says so instead of guessing.

## How it's built

Three pieces, no database:

- **The page** (`index.html`). Speech-to-text and text-to-speech both run in the browser through the Web Speech API, so the voice part costs nothing and needs no speech vendor or extra keys. A text box covers browsers that don't support it.
- **One serverless function** (`api/chat.js`). It takes the conversation history, adds the system prompt and the company notes, and calls Gemini. The API keys stay here on the server and never reach the browser.
- **The knowledge** (`api/_knowledge.js`). I read the twelve source PDFs and boiled each company down to a short brief. The off-limits numbers and every customer name were left out of the briefs on purpose, so the model can't repeat what isn't there. The system prompt enforces the same rules again on top.

A couple of decisions worth explaining:

I didn't build a vector database or a retrieval pipeline. With two companies and a few short briefs, there's nothing to retrieve. The notes are small enough to send on every request, which is simpler and has no moving parts to break.

The model is `gemini-flash-lite-latest`. It's quick and keeps answers short, which is what you want when a reply gets read aloud. If Gemini is rate-limited it falls back to `gemini-3.5-flash`, then OpenRouter, then NVIDIA, so a brief outage on one provider doesn't take the whole thing down.

It's hosted on Vercel. One command deploys it and hands back a public link with the keys set server-side.

## Running it locally

You need Node and a free Gemini key from https://aistudio.google.com/apikey.

```bash
cp .env.example .env.local      # add GEMINI_API_KEY
npx vercel dev                  # serves the page and the function at http://localhost:3000
```

Open it in Chrome or Edge and allow the mic. Voice needs a secure context, which both `localhost` and `https` satisfy.

## Deploying your own

```bash
npm i -g vercel
vercel                                # log in, accept the defaults
vercel env add GEMINI_API_KEY         # paste your key
# optional fallbacks:
# vercel env add OPENROUTER_API_KEY
# vercel env add NVIDIA_API_KEY
vercel --prod                         # prints your public link
```

## Layout

```
index.html          the voice and text interface
api/chat.js         serverless function, calls Gemini (keys live here)
api/_knowledge.js   the two company briefs and the guardrail prompt
```

## A few things worth asking it

- "What does Tyson Foods do?" then "what were their total sales last fiscal year?" (context stays on Tyson)
- "Now tell me about the other one's main products." (switches to Mensch und Maschine)
- "Who founded it?" as a first question (it asks which company)
- "Who are Tyson's biggest customers?" or "what's the CEO's pay?" (declines, offers what it can share)
- "What are Tyson's 2045 climate targets?" (not in the documents, so it says so)
