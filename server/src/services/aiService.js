// "Ask AI": more detail on a page, term or selection, from any configured AI provider (see ai/adapters).
// Answers can be saved as a page anywhere: private for users, shared when an admin saves (same rules as pages).
const ApiError = require('../utils/ApiError');
const { adapters } = require('../ai/adapters');
const settings = require('../ai/settings');
const { SYSTEM, contextText, userMessage } = require('../ai/prompts');
const { markdownToBlocks } = require('../ai/markdownToBlocks');
const { isAdmin, isVisible } = require('./access');
const questionRepository = require('../repositories/questionRepository');
const termRepository = require('../repositories/termRepository');
const questionService = require('./questionService');

const usage = new Map(); // userId → timestamps of requests in the last hour

function checkLimit(user, limitPerHour) {
  if (isAdmin(user) || !limitPerHour) return;
  const now = Date.now();
  const recent = (usage.get(String(user.id)) || []).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= limitPerHour) throw new ApiError(429, `You can ask the AI ${limitPerHour} times per hour. Try again later.`, null, 'AI_LIMIT');
  recent.push(now);
  usage.set(String(user.id), recent);
}

function canUse(user, s) {
  return s.enabled && s.providers.length > 0 && (s.allow === 'all' || isAdmin(user));
}

const aiService = {
  /** What the current user may do (no secrets). */
  async status(user) {
    const s = await settings.load();
    // reason (when not enabled) lets the UI explain what's missing instead of hiding the AI buttons
    let reason = null;
    if (!s.providers.length) reason = 'no-provider';
    else if (!s.enabled) reason = 'disabled';
    else if (!canUse(user, s)) reason = 'admins-only';
    return {
      enabled: canUse(user, s),
      reason,
      providers: canUse(user, s) ? s.providers.map(({ id, name, type, model }) => ({ id, name, type, model })) : [],
      defaultProvider: s.defaultProvider,
      limitPerHour: isAdmin(user) ? 0 : s.limitPerHour,
    };
  },

  /**
   * Validates the request and builds the prompt. Throws normal API errors (before streaming starts).
   * Returns { provider, run(onText, signal) }.
   */
  async prepare(user, { providerId, question, pageId, termId, selection }) {
    const s = await settings.load();
    if (!s.enabled || !s.providers.length) throw ApiError.badRequest('The AI assistant is not set up yet. An admin can add a provider in Settings → AI.');
    if (!canUse(user, s)) throw ApiError.forbidden('Only admins can use the AI assistant');
    const provider = s.providers.find((p) => p.id === (providerId || s.defaultProvider));
    if (!provider) throw ApiError.badRequest('Unknown AI provider');
    const adapter = adapters[provider.type];
    if (adapter.needsKey && !provider.apiKey) throw ApiError.badRequest(`${provider.name} has no API key. An admin can add it in Settings → AI.`);

    let topic = '';
    let notes = '';
    if (pageId) {
      const page = await questionRepository.findById(pageId);
      if (!isVisible(user, page)) throw ApiError.notFound('Page not found');
      topic = page.title;
      notes = contextText(page.blocks);
    } else if (termId) {
      const term = await termRepository.findById(termId);
      if (!isVisible(user, term)) throw ApiError.notFound('Term not found');
      topic = term.term;
      notes = [term.summary, contextText(term.blocks)].filter(Boolean).join('\n\n');
    }
    checkLimit(user, s.limitPerHour);

    const messages = [{ role: 'user', content: userMessage({ topic, notes, selection: selection?.slice(0, 2000), question }) }];
    return {
      provider: { id: provider.id, name: provider.name, model: provider.model },
      async run(onText, signal) {
        let full = '';
        // eslint-disable-next-line no-restricted-syntax
        for await (const chunk of adapter.stream({
          baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model, system: SYSTEM, messages,
          maxTokens: provider.maxTokens || s.maxTokens || 2500, temperature: provider.temperature, signal,
        })) {
          full += chunk;
          onText(chunk);
        }
        return full;
      },
    };
  },

  /** Markdown → blocks, to preview an answer exactly as it will be saved. */
  preview(markdown) {
    return markdownToBlocks(markdown);
  },

  /** Save an answer as a page: in a category, or as a sub-page of a page. */
  async save(user, { title, markdown, section, parent, provider }) {
    const note = {
      id: require('crypto').randomUUID(), type: 'callout', variant: 'note', color: '#eab308', title: '🤖 AI-generated',
      content: `<p>Written by ${provider ? `${provider.name} (${provider.model})` : 'an AI assistant'} on ${new Date().toISOString().slice(0, 10)}. Check the facts before relying on them.</p>`,
    };
    return questionService.create(user, { title, ...(parent ? { parent } : { section }), tags: ['ai'], blocks: [note, ...markdownToBlocks(markdown)] });
  },

  /** Admin: a tiny request to check a provider's URL, model and key. */
  async test(providerId) {
    const s = await settings.load();
    const provider = s.providers.find((p) => p.id === providerId);
    if (!provider) throw ApiError.notFound('Provider not found');
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      let text = '';
      // eslint-disable-next-line no-restricted-syntax
      for await (const chunk of adapters[provider.type].stream({
        baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model,
        system: 'You are a connectivity test.', messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
        maxTokens: 20, temperature: 0, signal: controller.signal,
      })) text += chunk;
      return { ok: true, ms: Date.now() - t0, sample: text.trim().slice(0, 80) };
    } catch (err) {
      return { ok: false, ms: Date.now() - t0, error: err.name === 'AbortError' ? 'No answer within 30 s' : err.message };
    } finally {
      clearTimeout(timer);
    }
  },

  _resetUsage: () => usage.clear(),
};

module.exports = aiService;
