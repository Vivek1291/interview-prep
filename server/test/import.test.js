// Importing a prepared .docx as categories + pages. The test builds its own small Word file.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
process.env.MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_import_test');
process.env.UPLOAD_DIR = require('path').join(require('os').tmpdir(), 'learning-hub-import-test-uploads');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { loadSecrets } = require('../src/config/secrets');
const { migrate } = require('../src/seed/migrate');

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5cf0000000049454e44ae426082', 'hex');

// ---- a tiny .docx writer (only what the tests need) ----
const x = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (text, { b, mono, color, shd } = {}) => `<w:r><w:rPr>${b ? '<w:b/>' : ''}${mono ? '<w:rFonts w:ascii="Roboto Mono" w:hAnsi="Roboto Mono"/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${shd ? `<w:shd w:val="clear" w:fill="${shd}"/>` : ''}</w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
const P = (...runs) => `<w:p>${runs.join('')}</w:p>`;
const H = (level, text) => `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>${run(text)}</w:p>`;
const LI = (text, numId = 1, ilvl = 0) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${run(text)}</w:p>`;
const CODE = (text) => P(run(text, { mono: true }));
const IMG = '<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="p" descr="Event loop picture"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rIdImg"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
const LINK = `<w:p><w:hyperlink r:id="rIdLink">${run('MDN')}</w:hyperlink>${run(' and ')}<w:hyperlink r:id="rIdBad">${run('bad')}</w:hyperlink></w:p>`;
const TABLE = `<w:tbl><w:tr><w:tc>${P(run('Method'))}</w:tc><w:tc>${P(run('Args'))}</w:tc></w:tr><w:tr><w:tc>${P(run('call'))}</w:tc><w:tc>${P(run('a, b'))}</w:tc></w:tr></w:tbl>`;

async function makeDocx(bodyXml) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${bodyXml}</w:body></w:document>`);
  zip.file('word/styles.xml', `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${[1, 2, 3].map((l) => `<w:style w:type="paragraph" w:styleId="Heading${l}"><w:name w:val="heading ${l}"/></w:style>`).join('')}</w:styles>`);
  zip.file('word/numbering.xml', '<?xml version="1.0"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg" Type="image" Target="media/image1.png"/><Relationship Id="rIdLink" Type="hyperlink" Target="https://developer.mozilla.org/" TargetMode="External"/><Relationship Id="rIdBad" Type="hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>');
  zip.file('word/media/image1.png', PNG);
  return zip.generateAsync({ type: 'nodebuffer' });
}

// A document shaped like real study notes: "Q)" questions with headings, code, lists, tables and images inside
const NOTES = [
  P(run('Some intro text before the first question.')),
  P(run('Q) What is a closure?', { b: true })),
  H(1, '🧠 Simple definition'),
  P(run('A closure '), run('remembers', { b: true }), run(' its scope. '), run('important', { shd: 'fef08a' }), run(' '), run('warn', { color: 'dc2626' }), run(' near-black', { color: '0a0a0a' })),
  LI('outer function'), LI('inner function', 1, 1), LI('returned'),
  LI('first', 2), LI('second', 2),
  H(2, 'Example'),
  CODE('function counter() {'), CODE('  let n = 0;'), P(), CODE('  return () => console.log(“n”, ++n);'), CODE('}'),
  P(run('Use '), run('counter()', { mono: true }), run(' twice.')),
  IMG,
  TABLE,
  LINK,
  `<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr>${run('Q) Explain call, apply and bind', { b: true })}</w:p>`,
  P(run('call invokes immediately.')),
  P(run('Q) explain more', { b: true })),
  P(run('follow-up answer')),
  `<w:tbl><w:tr><w:tc>${CODE('npm install express')}${CODE('npm start')}</w:tc></w:tr></w:tbl>`,
].join('');

const HEADINGS = [
  H(1, 'JavaScript'), H(2, 'Closures'), P(run('closure text')), H(2, 'Promises'), P(run('promise text')), H(3, 'then()'), P(run('then text')),
  H(1, 'React'), P(run('react intro')), H(2, 'Hooks'), P(run('hooks text')),
].join('');

async function signUp(name, email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'Secret123' }).expect(201);
  const call = (method, url) => agent[method](url).set('Authorization', `Bearer ${res.body.accessToken}`);
  return { user: res.body.user, get: (u) => call('get', u), post: (u) => call('post', u), del: (u) => call('delete', u) };
}

let admin;
let learner;
let notesDocx;
let headingsDocx;
let tree;

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  await loadSecrets();
  await migrate();
  admin = await signUp('Admin', 'admin@example.com');
  learner = await signUp('Lee', 'lee@example.com');
  notesDocx = await makeDocx(NOTES);
  headingsDocx = await makeDocx(HEADINGS);
  tree = (await admin.get('/api/sections').expect(200)).body.data;
});
after(async () => {
  await mongoose.disconnect();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

const startImport = (who, buffer, name = 'JavaScript notes.docx') => who.post('/api/imports').attach('file', buffer, name);
const pagesIn = async (who, sectionId) => (await who.get(`/api/questions?section=${sectionId}`).expect(200)).body.data;

test('analysis suggests splitting on "Q)" and lists heading options', async () => {
  const res = await startImport(admin, notesDocx).expect(201);
  const a = res.body.data;
  assert.equal(a.fileName, 'JavaScript notes');
  assert.deepEqual(a.suggested, { type: 'prefix', prefix: 'Q)' });
  assert.equal(a.rules.find((r) => r.type === 'prefix').count, 3);
  assert.ok(a.rules.some((r) => r.type === 'heading' && r.level === 1));
  assert.ok(a.rules.some((r) => r.type === 'single'));
  assert.deepEqual(a.stats, { paragraphs: 13, headings: 3, codeLines: 6, tables: 1, images: 1 });

  const pv = (await admin.post(`/api/imports/${a.id}/preview`).send({ rule: a.suggested }).expect(200)).body.data;
  assert.deepEqual(pv.items.map((i) => i.title), ['Introduction', 'What is a closure?', 'Explain call, apply and bind', 'explain more']);
  assert.equal(pv.items[1].stats.codeLines, 4);
});

test('admin import: shared pages with code, lists, tables, images and safe links; rename, merge and skip', async () => {
  const a = (await startImport(admin, notesDocx).expect(201)).body.data;
  const pv = (await admin.post(`/api/imports/${a.id}/preview`).send({ rule: a.suggested }).expect(200)).body.data;
  const [intro, closure, , more] = pv.items;
  const parent = tree.nodes.find((n) => n.key === 'frontend/javascript')._id;
  const res = await admin.post(`/api/imports/${a.id}/commit`).send({
    rule: a.suggested, parent, newCategory: { title: 'My JS notes' },
    items: [{ key: intro.key, skip: true }, { key: closure.key, title: 'Closures' }, { key: more.key, merge: true }],
  }).expect(201);
  assert.deepEqual({ ...res.body.data, category: undefined }, { category: undefined, categories: 1, pages: 2, images: 1 });

  const t = (await admin.get('/api/sections').expect(200)).body.data;
  const cat = t.nodes.find((n) => String(n._id) === String(res.body.data.category));
  assert.equal(cat.title, 'My JS notes');
  assert.equal(String(cat.parent), String(parent));
  assert.equal(cat.owner, null, 'admin imports are shared');

  const pages = await pagesIn(admin, cat._id);
  assert.deepEqual(pages.map((p) => p.title), ['Closures', 'Explain call, apply and bind']);
  const closurePage = (await admin.get(`/api/questions/${pages[0]._id}`).expect(200)).body.data;
  const types = closurePage.blocks.map((b) => b.type);
  assert.deepEqual(types, ['text', 'code', 'text', 'image', 'text']);
  const [t1, code, t2, img, t3] = closurePage.blocks;
  assert.match(t1.content, /<h2>🧠 Simple definition<\/h2>/);
  assert.match(t1.content, /<strong>remembers<\/strong>/);
  assert.match(t1.content, /<mark data-color="#fef08a"[^>]*>important<\/mark>/);
  assert.match(t1.content, /<span style="color: #dc2626">warn<\/span>/);
  assert.doesNotMatch(t1.content, /#0a0a0a/, 'near-black text colour is dropped');
  assert.match(t1.content, /<ul><li><p>outer function<\/p><ul><li><p>inner function<\/p><\/li><\/ul><\/li><li><p>returned<\/p><\/li><\/ul><ol><li><p>first<\/p><\/li><li><p>second<\/p><\/li><\/ol>/);
  assert.match(t1.content, /<h3>Example<\/h3>/);
  assert.doesNotMatch(t1.content, /What is a closure/, 'the title line is not repeated');
  assert.equal(code.lang, 'javascript');
  assert.equal(code.content, 'function counter() {\n  let n = 0;\n\n  return () => console.log("n", ++n);\n}', 'blank lines kept, smart quotes straightened');
  assert.match(t2.content, /<code>counter\(\)<\/code>/);
  assert.match(img.content, /^\/uploads\/.+\.png$/);
  assert.equal(img.title, 'Event loop picture');
  assert.ok(fs.existsSync(path.join(process.env.UPLOAD_DIR, path.basename(img.content))), 'image file saved');
  assert.match(t3.content, /<table><tbody><tr><th><p>Method<\/p><\/th>/);
  assert.match(t3.content, /<a href="https:\/\/developer\.mozilla\.org\/"[^>]*>MDN<\/a>/);
  assert.doesNotMatch(t3.content, /javascript:/i, 'unsafe links are dropped');

  const callPage = (await admin.get(`/api/questions/${pages[1]._id}`).expect(200)).body.data;
  assert.match(callPage.blocks[0].content, /<h2>explain more<\/h2><p>follow-up answer<\/p>/, 'merged page keeps its title as a heading');
  assert.deepEqual(callPage.blocks.at(-1), { ...callPage.blocks.at(-1), type: 'code', lang: 'bash', content: 'npm install express\nnpm start' }, 'one-cell monospace table → code block');

  // the learner sees the shared import
  assert.equal((await pagesIn(learner, cat._id)).length, 2);
  // the session is used up
  await admin.post(`/api/imports/${a.id}/preview`).send({ rule: a.suggested }).expect(404);
});

test('heading split builds sub-categories; learner imports are private', async () => {
  const a = (await startImport(learner, headingsDocx, 'Frontend notes.docx').expect(201)).body.data;
  const rule = { type: 'heading', level: 2 };
  const pv = (await learner.post(`/api/imports/${a.id}/preview`).send({ rule }).expect(200)).body.data;
  assert.deepEqual(pv.items.map((i) => `${'  '.repeat(i.depth)}${i.type[0]}:${i.title}`), [
    'c:JavaScript', '  p:Closures', '  p:Promises', 'c:React', '  p:Overview', '  p:Hooks',
  ]);
  const res = await learner.post(`/api/imports/${a.id}/commit`).send({ rule, newCategory: { title: 'Frontend notes' } }).expect(201);
  assert.deepEqual({ ...res.body.data, category: undefined }, { category: undefined, categories: 3, pages: 4, images: 0 });

  const mine = (await learner.get('/api/sections').expect(200)).body.data;
  const root = mine.nodes.find((n) => n.title === 'Frontend notes');
  assert.equal(root.parent, null);
  assert.equal(String(root.owner), String(learner.user._id), 'private to the learner');
  const js = mine.nodes.find((n) => n.title === 'JavaScript' && String(n.parent) === String(root._id));
  const promises = (await pagesIn(learner, js._id)).find((p) => p.title === 'Promises');
  const full = (await learner.get(`/api/questions/${promises._id}`).expect(200)).body.data;
  assert.match(full.blocks[0].content, /<p>promise text<\/p><h2>then\(\)<\/h2><p>then text<\/p>/);

  const adminView = (await admin.get('/api/sections').expect(200)).body.data;
  assert.ok(!adminView.nodes.some((n) => n.title === 'Frontend notes'), 'the admin cannot see a private import');
});

test('permissions and bad input', async () => {
  // someone else's import session
  const a = (await startImport(admin, notesDocx).expect(201)).body.data;
  await learner.post(`/api/imports/${a.id}/preview`).send({ rule: a.suggested }).expect(404);
  // a learner may not put pages into another user's private category; admins may not put shared content in private ones
  const mine = (await learner.get('/api/sections').expect(200)).body.data.nodes.find((n) => n.title === 'Frontend notes');
  await admin.post(`/api/imports/${a.id}/commit`).send({ rule: a.suggested, parent: mine._id }).expect(404);
  await admin.post(`/api/imports/${a.id}/commit`).send({ rule: a.suggested }).expect(400);           // no destination
  await admin.post(`/api/imports/${a.id}/commit`).send({ rule: { type: 'heading', level: 9 }, newCategory: { title: 'x' } }).expect(400);
  await admin.del(`/api/imports/${a.id}`).expect(200);
  await admin.del(`/api/imports/${a.id}`).expect(404);

  const notDocx = await admin.post('/api/imports').attach('file', Buffer.from('hello'), 'notes.docx').expect(400);
  assert.match(notDocx.body.message, /not a valid \.docx/);
  const oldDoc = await admin.post('/api/imports').attach('file', Buffer.from('x'), 'notes.doc').expect(400);
  assert.match(oldDoc.body.message, /Save as/);
  const pdf = await admin.post('/api/imports').attach('file', Buffer.from('x'), 'notes.pdf').expect(400);
  assert.match(pdf.body.message, /\.docx/);
  const badLink = await admin.post('/api/imports').send({ url: 'https://example.com/document/d/abc' }).expect(400);
  assert.match(badLink.body.message, /Google Docs link/);
  await admin.post('/api/imports').send({}).expect(400);
  await request(app).post('/api/imports').attach('file', notesDocx, 'x.docx').expect(401);
});

// ---------------------------------------------------------------------------------------------
// Google Docs with tabs (the Google calls are replaced by fakes: tests never touch the network)
const google = require('../src/import/googleDocs');

test('the tab list is read from the Google Docs page (first tab included)', () => {
  const html = '<meta property="og:title" content="JS &amp; more"><script>DOCS_modelChunk = {"chunk":[{"ty":"ac","d":["t.aaaaaaaa",[1,"Async"],[1]]},{"ty":"ac","d":["t.bbbbbbbb",[1,"Promises \\u2728"],[1,0]]},{"ty":"ac","d":["t.cccccccc",[1,"Polyfill"],[1,0,0]]},{"ty":"ac","d":["t.dddddddd",[1,"Basics"],[2]]}]}; x("t.0", 99)</script>';
  const r = google.parseTabs(html);
  assert.equal(r.title, 'JS & more');
  assert.deepEqual(r.tabs.map((t) => `${t.path.join('.')} ${t.id} ${t.title}`), ['0 t.0 ', '1 t.aaaaaaaa Async', '1.0 t.bbbbbbbb Promises ✨', '1.0.0 t.cccccccc Polyfill', '2 t.dddddddd Basics']);
  // a broken structure (sub-tab without its parent) is not trusted → whole-document import
  assert.deepEqual(google.parseTabs('{"ty":"ac","d":["t.aaaaaaaa",[1,"A"],[3,2]]}').tabs, []);
});

test('Google Docs tabs: pick tabs, sub-tabs become sub-categories or sections, progress is reported', async (t) => {
  const PNG2 = Buffer.concat([PNG, Buffer.from('second')]);
  const docs = {
    't.0': await makeDocx(P(run('Q) What is JavaScript?', { b: true })) + P(run('A language.'))),
    't.async000': await makeDocx(P(run('Async intro')) + IMG),                                         // image1.png
    't.promise0': await makeDocx(H(1, 'Basics') + P(run('A promise is a value later.')) + CODE('new Promise(r => r(1));')),
    't.poly0000': await makeDocx(P(run('Polyfill text')) + IMG),                                        // also image1.png, different file
    't.basics00': await makeDocx(''),                                                                   // empty container tab
    't.var00000': await makeDocx(P(run('var is function scoped'))),
    't.call0000': await makeDocx(P(run('call text'))),
    't.callpoly': await makeDocx(P(run('call polyfill text')) + CODE('Function.prototype.myCall = function () {};')),
    't.empty000': await makeDocx(''),
  };
  // the polyfill tab's image is a different picture with the same name inside its own .docx
  const polyZip = await JSZip.loadAsync(docs['t.poly0000']);
  polyZip.file('word/media/image1.png', PNG2);
  docs['t.poly0000'] = await polyZip.generateAsync({ type: 'nodebuffer' });

  const tabs = [
    { id: 't.0', title: '', path: [0] },
    { id: 't.async000', title: 'Async Operations', path: [1] },
    { id: 't.promise0', title: 'Promises', path: [1, 0] },
    { id: 't.poly0000', title: 'Promise Polyfill', path: [1, 0, 0] },
    { id: 't.basics00', title: 'Basic Interview Question', path: [2] },
    { id: 't.var00000', title: 'var, let and const', path: [2, 0] },
    { id: 't.call0000', title: 'Call', path: [2, 1] },
    { id: 't.callpoly', title: 'Call Polyfill', path: [2, 1, 0] },
    { id: 't.empty000', title: 'Tab 9', path: [3] },
  ];
  const downloads = [];
  t.mock.method(google, 'fetchTabs', async () => ({ title: 'Javascript Interview Prep', tabs: tabs.map((x) => ({ ...x })) }));
  t.mock.method(google, 'exportDocx', async (docId, tabId) => {
    downloads.push(tabId || 'whole');
    await new Promise((r) => setTimeout(r, 15));
    return { buffer: tabId ? docs[tabId] : notesDocx, fileName: 'Javascript Interview Prep.docx' };
  });
  const URL_ = 'https://docs.google.com/document/d/1h-jFJKi9FtdfNHxiKYyoqZ-tvfJaTiIyhMVCJf7JYvI/edit?usp=sharing';

  const a = (await admin.post('/api/imports').send({ url: URL_ }).expect(201)).body.data;
  assert.equal(a.mode, 'tabs');
  assert.equal(a.fileName, 'Javascript Interview Prep');
  assert.equal(a.tabs[0].title, 'What is JavaScript?', 'the unnamed first tab is named after its first line');
  assert.deepEqual(downloads, ['t.0'], 'only the unnamed tab is downloaded up front');

  // switch to "whole document" and back
  const whole = (await admin.post(`/api/imports/${a.id}/whole-document`).expect(200)).body.data;
  assert.equal(whole.mode, 'document');
  assert.equal(whole.canUseTabs, true);
  assert.deepEqual(whole.suggested, { type: 'prefix', prefix: 'Q)' });
  const back = (await admin.post(`/api/imports/${a.id}/tabs`).expect(200)).body.data;
  assert.equal(back.mode, 'tabs');

  // learners can't touch the admin's import
  await learner.post(`/api/imports/${a.id}/commit-tabs`).send({ newCategory: { title: 'x' }, tabs: [{ id: 't.0' }] }).expect(404);

  const job = (await admin.post(`/api/imports/${a.id}/commit-tabs`).send({
    newCategory: { title: 'JS Prep' },
    tabs: [
      { id: 't.0' },
      { id: 't.async000' }, { id: 't.promise0', title: 'Promises 101' }, { id: 't.poly0000' },          // Async → Promises → Polyfill (folders)
      { id: 't.var00000' },                                                                              // parent "Basic…" NOT ticked → moves up
      { id: 't.call0000', as: 'page' }, { id: 't.callpoly' },                                            // Call as ONE page with its sub-tab inside
      { id: 't.empty000' },                                                                              // empty → skipped
    ],
  }).expect(202)).body.data;
  assert.equal(job.state, 'running');
  await admin.post(`/api/imports/${a.id}/commit-tabs`).send({ newCategory: { title: 'x' }, tabs: [{ id: 't.0' }] }).expect(409);

  let status;
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    status = (await admin.get(`/api/imports/${a.id}/status`).expect(200)).body.data;
    seen.add(status.step);
    if (status.state !== 'running') break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(status.state, 'done', status.error);
  assert.ok(seen.has('download'), 'progress reported while downloading');
  assert.deepEqual({ ...status.result, category: undefined }, { category: undefined, categories: 3, pages: 6, images: 2, skipped: 1 });
  assert.ok(!downloads.slice(1).includes('t.0'), 'the first tab was not downloaded twice');
  await admin.get(`/api/imports/${a.id}/status`).expect(404); // reported once, then freed

  const tr = (await admin.get('/api/sections').expect(200)).body.data;
  const kids = (id) => tr.nodes.filter((n) => String(n.parent) === String(id)).sort((x, y) => x.order - y.order);
  const pages = (id) => tr.pages.filter((p) => String(p.section) === String(id)).sort((x, y) => x.order - y.order).map((p) => p.title);
  const root = tr.nodes.find((n) => String(n._id) === String(status.result.category));
  assert.equal(root.title, 'JS Prep');
  assert.deepEqual(pages(root._id), ['What is JavaScript?', 'var, let and const', 'Call']);
  const asyncCat = kids(root._id)[0];
  assert.equal(asyncCat.title, 'Async Operations');
  assert.deepEqual(pages(asyncCat._id), ['Async Operations'], 'a tab with sub-tabs: category + its own text as the first page');
  const promCat = kids(asyncCat._id)[0];
  assert.equal(promCat.title, 'Promises 101');
  assert.deepEqual(pages(promCat._id), ['Promises 101', 'Promise Polyfill']);
  assert.equal(kids(root._id).length, 1, 'no category for the unticked "Basic Interview Question" or the empty tab');

  const callId = tr.pages.find((p) => p.title === 'Call')._id;
  const call = (await admin.get(`/api/questions/${callId}`).expect(200)).body.data;
  assert.match(call.blocks[0].content, /<p>call text<\/p><h2>Call Polyfill<\/h2><p>call polyfill text<\/p>/, 'sub-tab becomes a section');
  assert.equal(call.blocks[1].type, 'code');

  const imgOf = async (title) => (await admin.get(`/api/questions/${tr.pages.find((p) => p.title === title)._id}`).expect(200)).body.data.blocks.find((b) => b.type === 'image').content;
  const [img1, img2] = [await imgOf('Async Operations'), await imgOf('Promise Polyfill')];
  assert.notEqual(img1, img2, 'same image name in two tabs → two different files');
  assert.deepEqual(fs.readFileSync(path.join(process.env.UPLOAD_DIR, path.basename(img2))), PNG2);
  const prom = (await admin.get(`/api/questions/${tr.pages.find((p) => p.title === 'Promises 101')._id}`).expect(200)).body.data;
  assert.match(prom.blocks[0].content, /<h2>Basics<\/h2><p>A promise is a value later\.<\/p>/);
});

test('Google Docs: a document without tabs, a document that is not shared, a failing tab', async (t) => {
  const URL_ = 'https://docs.google.com/document/d/1h-jFJKi9FtdfNHxiKYyoqZ-tvfJaTiIyhMVCJf7JYvI/edit';
  t.mock.method(google, 'fetchTabs', async () => ({ title: 'Plain doc', tabs: [] }));
  t.mock.method(google, 'exportDocx', async () => ({ buffer: notesDocx, fileName: 'Plain doc.docx' }));
  const a = (await admin.post('/api/imports').send({ url: URL_ }).expect(201)).body.data;
  assert.equal(a.mode, 'document');
  assert.equal(a.fileName, 'Plain doc');
  await admin.post(`/api/imports/${a.id}/whole-document`).expect(400);
  await admin.del(`/api/imports/${a.id}`).expect(200);

  const ApiError = require('../src/utils/ApiError');
  google.fetchTabs.mock.mockImplementation(async () => { throw ApiError.badRequest('Google did not share this document. …'); });
  const notShared = await admin.post('/api/imports').send({ url: URL_ }).expect(400);
  assert.match(notShared.body.message, /did not share/);

  // a tab that keeps failing → the job reports an error and nothing is created
  google.fetchTabs.mock.mockImplementation(async () => ({ title: 'Doc', tabs: [{ id: 't.aaaaaaaa', title: 'A', path: [0] }, { id: 't.bbbbbbbb', title: 'B', path: [1] }] }));
  google.exportDocx.mock.mockImplementation(async (id, tab) => { if (tab === 't.bbbbbbbb') throw ApiError.badRequest('Google Docs answered 500. Try again, or upload the file as .docx.'); return { buffer: notesDocx }; });
  const before = (await admin.get('/api/sections').expect(200)).body.data.nodes.length;
  const b = (await admin.post('/api/imports').send({ url: URL_ }).expect(201)).body.data;
  await admin.post(`/api/imports/${b.id}/commit-tabs`).send({ newCategory: { title: 'Broken' }, tabs: [{ id: 't.aaaaaaaa' }, { id: 't.bbbbbbbb' }] }).expect(202);
  let status;
  for (let i = 0; i < 300; i += 1) {
    status = (await admin.get(`/api/imports/${b.id}/status`).expect(200)).body.data;
    if (status.state !== 'running') break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(status.state, 'error');
  assert.match(status.error, /answered 500/);
  assert.equal((await admin.get('/api/sections').expect(200)).body.data.nodes.length, before, 'nothing was created');
});
