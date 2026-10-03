// Helpers to read streaming HTTP responses from AI providers.
const ApiError = require('../utils/ApiError');

/** Yields text lines from a fetch Response body. */
async function* lines(res) {
  const decoder = new TextDecoder();
  let buf = '';
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      yield buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
    }
  }
  if (buf) yield buf;
}

/** Yields { event, data } for each Server-Sent Event. */
async function* sseEvents(res) {
  let event = 'message';
  let data = [];
  // eslint-disable-next-line no-restricted-syntax
  for await (const line of lines(res)) {
    if (line === '') {
      if (data.length) yield { event, data: data.join('\n') };
      event = 'message';
      data = [];
    } else if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length) yield { event, data: data.join('\n') };
}

/** Throws a readable error for a non-2xx provider response (never includes the API key). */
async function ensureOk(res, label) {
  if (res.ok) return;
  let detail = '';
  try {
    const text = await res.text();
    try { const j = JSON.parse(text); detail = j.error?.message || j.error || j.message || text; } catch { detail = text; }
  } catch { /* ignore */ }
  const hint = res.status === 401 || res.status === 403 ? ' (check the API key)' : res.status === 404 ? ' (check the model name and base URL)' : res.status === 429 ? ' (rate limited or out of credit)' : '';
  throw ApiError.badRequest(`${label} answered ${res.status}${hint}: ${String(detail).slice(0, 300)}`);
}

const trimUrl = (u) => String(u || '').replace(/\/+$/, '');

module.exports = { lines, sseEvents, ensureOk, trimUrl };
