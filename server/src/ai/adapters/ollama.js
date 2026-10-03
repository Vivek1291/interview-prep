// Ollama: local models (llama, qwen, mistral…) on your own machine. Streams newline-delimited JSON.
const { lines, ensureOk, trimUrl } = require('../stream');

module.exports = {
  type: 'ollama',
  label: 'Ollama (local models)',
  needsKey: false,
  defaults: { baseUrl: 'http://host.docker.internal:11434', model: '' },
  modelHint: 'a model you pulled, e.g. the name shown by `ollama list`',
  async *stream({ baseUrl, model, system, messages, maxTokens, temperature, signal }) {
    const res = await fetch(`${trimUrl(baseUrl)}/api/chat`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        stream: true,
        options: { num_predict: maxTokens, ...(temperature != null ? { temperature } : {}) },
      }),
    });
    await ensureOk(res, 'Ollama');
    // eslint-disable-next-line no-restricted-syntax
    for await (const line of lines(res)) {
      if (!line.trim()) continue;
      const d = JSON.parse(line);
      if (d.error) throw new Error(`Ollama: ${d.error}`);
      if (d.message?.content) yield d.message.content;
      if (d.done) return;
    }
  },
};
