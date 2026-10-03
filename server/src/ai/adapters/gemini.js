// Google Gemini (Generative Language API, streaming with SSE).
const { sseEvents, ensureOk, trimUrl } = require('../stream');

module.exports = {
  type: 'gemini',
  label: 'Google Gemini',
  needsKey: true,
  defaults: { baseUrl: 'https://generativelanguage.googleapis.com', model: '' },
  modelHint: 'the model id from ai.google.dev/gemini-api/docs/models',
  async *stream({ baseUrl, apiKey, model, system, messages, maxTokens, temperature, signal }) {
    const res = await fetch(`${trimUrl(baseUrl)}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: maxTokens, ...(temperature != null ? { temperature } : {}) },
      }),
    });
    await ensureOk(res, 'Gemini');
    // eslint-disable-next-line no-restricted-syntax
    for await (const { data } of sseEvents(res)) {
      const d = JSON.parse(data);
      if (d.error) throw new Error(`Gemini: ${d.error.message}`);
      const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (text) yield text;
    }
  },
};
