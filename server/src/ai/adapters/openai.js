// OpenAI Chat Completions (streaming) and every OpenAI-compatible API
// (Groq, OpenRouter, Mistral, DeepSeek, Together, Fireworks, LM Studio, vLLM, LocalAI…).
const { sseEvents, ensureOk, trimUrl } = require('../stream');

function make({ type, label, needsKey, defaults, modelHint, tokenParam, presets }) {
  return {
    type, label, needsKey, defaults, modelHint, presets,
    async *stream({ baseUrl, apiKey, model, system, messages, maxTokens, temperature, signal }) {
      const res = await fetch(`${trimUrl(baseUrl)}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, ...messages],
          stream: true,
          [tokenParam]: maxTokens,
          ...(temperature != null ? { temperature } : {}),
        }),
      });
      await ensureOk(res, label);
      // eslint-disable-next-line no-restricted-syntax
      for await (const { data } of sseEvents(res)) {
        if (data === '[DONE]') return;
        const d = JSON.parse(data);
        if (d.error) throw new Error(`${label}: ${d.error.message || d.error}`);
        const text = d.choices?.[0]?.delta?.content;
        if (text) yield text;
      }
    },
  };
}

const openai = make({
  type: 'openai', label: 'OpenAI', needsKey: true, tokenParam: 'max_completion_tokens',
  defaults: { baseUrl: 'https://api.openai.com/v1', model: '' }, modelHint: 'the model id from platform.openai.com/docs/models',
});

const compatible = make({
  type: 'openai-compatible', label: 'OpenAI-compatible API', needsKey: false, tokenParam: 'max_tokens',
  defaults: { baseUrl: '', model: '' }, modelHint: 'the model id of that service',
  presets: [
    { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
    { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
    { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
    { name: 'Together', baseUrl: 'https://api.together.xyz/v1' },
    { name: 'LM Studio (local)', baseUrl: 'http://host.docker.internal:1234/v1' },
  ],
});

module.exports = { openai, compatible };
