const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const block = z.object({
  id: z.string().min(1),
  type: z.enum(['text', 'callout', 'code', 'diagram', 'chart', 'image', 'links']),
  title: z.string().optional().default(''),
  content: z.string().optional().default(''),
  color: z.string().optional().default(''),
  variant: z.string().optional().default(''),
  lang: z.string().optional().default(''),
  chartType: z.string().optional().default(''),
  collapsed: z.boolean().optional().default(false),
});

const quickNote = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  color: z.string().optional().default('#fde68a'),
});

// .strict(): unknown fields (e.g. "owner") are rejected instead of silently ignored
const sectionCreate = z.object({
  title: z.string().trim().min(1).max(120),
  icon: z.string().max(8).optional(),
  color: z.string().max(30).optional(),
  description: z.string().max(2000).optional(),
  parent: objectId.nullable().optional(),
}).strict();
const sectionUpdate = sectionCreate.partial().strict();

const questionCreate = z.object({
  section: objectId.optional(),                 // optional when `parent` is given (a sub-page lives in its parent's section)
  parent: objectId.nullable().optional(),       // the page this is a sub-page of
  title: z.string().trim().min(1).max(300),
  priority: z.number().int().min(1).max(3).optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  blocks: z.array(block).optional(),
  quickNotes: z.array(quickNote).optional(),
}).strict().refine((q) => q.section || q.parent, { message: 'section or parent is required', path: ['section'] });
const questionUpdate = z.object(questionCreate._def.schema.shape).partial().strict();

const reorder = z.object({ ids: z.array(objectId).min(1) }).strict();

const noteCreate = z.object({
  text: z.string().trim().min(1).max(2000),
  color: z.string().max(30).optional(),
}).strict();

const progressUpdate = z.object({
  status: z.enum(['new', 'learning', 'revise', 'confident']).optional(),
  starred: z.boolean().optional(),
}).strict();

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(200);
const password = z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters');
const name = z.string().trim().min(2, 'Name must have at least 2 characters').max(60);

const register = z.object({ name, email, password }).strict();
const login = z.object({ email, password: z.string().min(1, 'Enter your password').max(200) }).strict();
const profileUpdate = z.object({ name }).strict();
const passwordChange = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password }).strict();
const roleUpdate = z.object({ role: z.enum(['admin', 'user']) }).strict();

// ---- Glossary terms ----
const aliasList = z.array(z.string().trim().max(80)).max(12).transform((a) => a.filter(Boolean));   // blanks dropped
const termCreate = z.object({
  term: z.string().trim().min(1).max(80),
  aliases: aliasList.optional().default([]),
  summary: z.string().trim().max(400).optional().default(''),
  blocks: z.array(block).max(200).optional().default([]),
}).strict();
const termUpdate = z.object({
  term: z.string().trim().min(1).max(80).optional(),
  aliases: aliasList.optional(),
  summary: z.string().trim().max(400).optional(),
  blocks: z.array(block).max(200).optional(),
}).strict();

// ---- Import a document ----
const importRule = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), level: z.number().int().min(1).max(6) }).strict(),
  z.object({ type: z.literal('prefix'), prefix: z.string().trim().min(1).max(40) }).strict(),
  z.object({ type: z.literal('single') }).strict(),
]);
const importStart = z.object({ url: z.string().trim().url().max(500) }).strict();
const importPreview = z.object({ rule: importRule }).strict();
const importCommit = z.object({
  rule: importRule,
  parent: objectId.nullable().optional(),
  newCategory: z.object({
    title: z.string().trim().min(1).max(120),
    icon: z.string().max(8).optional(),
    color: z.string().max(30).optional(),
    description: z.string().max(500).optional(),
  }).strict().optional(),
  items: z.array(z.object({
    key: z.string().max(20),
    title: z.string().max(300).optional(),
    merge: z.boolean().optional(),
    skip: z.boolean().optional(),
  }).strict()).max(20000).optional(),
}).strict();

const importCommitTabs = z.object({
  parent: objectId.nullable().optional(),
  newCategory: importCommit.shape.newCategory,
  tabs: z.array(z.object({
    id: z.string().regex(/^t\.[a-z0-9]{1,20}$/),   // the first tab is "t.0"
    title: z.string().max(300).optional(),
    as: z.enum(['folder', 'page']).optional(),
  }).strict()).min(1).max(1000),
}).strict();

// ---- AI assistant ----
const aiAsk = z.object({
  question: z.string().trim().min(1).max(2000),
  providerId: z.string().max(80).optional(),
  pageId: objectId.optional(),
  termId: objectId.optional(),
  selection: z.string().max(5000).optional(),
}).strict();
const aiPreview = z.object({ markdown: z.string().max(200000) }).strict();
const aiSave = z.object({
  title: z.string().trim().min(1).max(300),
  markdown: z.string().min(1).max(200000),
  section: objectId.optional(),
  parent: objectId.optional(),
  provider: z.object({ id: z.string().max(80), name: z.string().max(80), model: z.string().max(120) }).partial().optional(),
}).strict().refine((b) => b.section || b.parent, { message: 'Choose where to save it', path: ['section'] });
const aiProvider = z.object({
  id: z.string().max(80).optional(),
  name: z.string().trim().min(1).max(60),
  type: z.enum(['anthropic', 'openai', 'openai-compatible', 'gemini', 'ollama']),
  model: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().max(300).regex(/^(https?:\/\/\S+)?$/, 'Base URL must start with http:// or https://').optional(),
  apiKey: z.string().max(500).optional(),
  clearKey: z.boolean().optional(),
  maxTokens: z.number().int().min(50).max(64000).nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  source: z.string().optional(), hasKey: z.boolean().optional(), keyPreview: z.string().optional(),
}).strip();
const aiSettings = z.object({
  enabled: z.boolean().optional(),
  allow: z.enum(['all', 'admins']).optional(),
  limitPerHour: z.number().int().min(0).max(10000).optional(),
  maxTokens: z.number().int().min(50).max(64000).optional(),
  defaultProvider: z.string().max(80).nullable().optional(),
  providers: z.array(aiProvider).max(30).optional(),
}).strip();

module.exports = {
  sectionCreate, sectionUpdate, questionCreate, questionUpdate, reorder, noteCreate, progressUpdate,
  register, login, profileUpdate, passwordChange, roleUpdate, objectId,
  importStart, importPreview, importCommit, importCommitTabs, termCreate, termUpdate,
  aiAsk, aiPreview, aiSave, aiSettings,
};
