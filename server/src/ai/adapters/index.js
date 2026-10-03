// The AI adapter registry. To support a new kind of AI service:
//   1. If it speaks the OpenAI Chat Completions API (most do), just add a provider of type
//      "openai-compatible" in Settings → AI (or in AI_PROVIDERS): no code needed.
//   2. Otherwise add a file here exporting { type, label, needsKey, defaults, modelHint, async *stream(opts) }
//      that yields text chunks, and register it below.
const anthropic = require('./anthropic');
const { openai, compatible } = require('./openai');
const gemini = require('./gemini');
const ollama = require('./ollama');

const adapters = Object.fromEntries([anthropic, openai, compatible, gemini, ollama].map((a) => [a.type, a]));

module.exports = { adapters, types: Object.keys(adapters) };
