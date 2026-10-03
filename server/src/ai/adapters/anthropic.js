// Anthropic Claude (Messages API, streaming). https://docs.anthropic.com/en/api/messages-streaming
const { sseEvents, ensureOk, trimUrl } = require('../stream');

module.exports = {
  type: 'anthropic',
  label: 'Anthropic (Claude)',
  needsKey: true,
  defaults: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5' },
  modelHint: 'claude-sonnet-5, claude-opus-5-5, claude-haiku-4-5-20251001',
  async *stream({ baseUrl, apiKey, model, system, messages, maxTokens, temperature, signal }) {
    const res = await fetch(`${trimUrl(baseUrl)}/v1/messages`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, stream: true, ...(temperature != null ? { temperature } : {}) }),
    });
    await ensureOk(res, 'Anthropic');
    // eslint-disable-next-line no-restricted-syntax
    for await (const { data } of sseEvents(res)) {
      const d = JSON.parse(data);
      if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') yield d.delta.text;
      else if (d.type === 'error') throw new Error(`Anthropic: ${d.error?.message || 'stream error'}`);
    }
  },
};
