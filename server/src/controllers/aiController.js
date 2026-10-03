// AI assistant HTTP layer. /ai/ask streams Server-Sent Events: {type:"text"} … then {type:"done"} or {type:"error"}.
const asyncHandler = require('../utils/asyncHandler');
const aiService = require('../services/aiService');
const settings = require('../ai/settings');

exports.status = asyncHandler(async (req, res) => res.json({ success: true, data: await aiService.status(req.user) }));

exports.ask = asyncHandler(async (req, res) => {
  const job = await aiService.prepare(req.user, req.body);        // permission / config errors → normal JSON error
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });   // user closed the panel: stop the AI request
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  send({ type: 'start', provider: job.provider });
  try {
    const text = await job.run((chunk) => send({ type: 'text', text: chunk }), controller.signal);
    send({ type: 'done', length: text.length });
  } catch (err) {
    if (err.name !== 'AbortError') send({ type: 'error', message: err.message || 'The AI request failed' });
  }
  res.end();
});

exports.preview = asyncHandler(async (req, res) => res.json({ success: true, data: aiService.preview(req.body.markdown) }));

exports.save = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await aiService.save(req.user, req.body) }));

exports.getSettings = asyncHandler(async (req, res) => res.json({ success: true, data: await settings.forAdmin() }));
exports.saveSettings = asyncHandler(async (req, res) => res.json({ success: true, data: await settings.save(req.body) }));
exports.test = asyncHandler(async (req, res) => res.json({ success: true, data: await aiService.test(req.params.id) }));
