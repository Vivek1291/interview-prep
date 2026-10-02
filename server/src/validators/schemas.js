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
  section: objectId,
  title: z.string().trim().min(1).max(300),
  priority: z.number().int().min(1).max(3).optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  blocks: z.array(block).optional(),
  quickNotes: z.array(quickNote).optional(),
}).strict();
const questionUpdate = questionCreate.partial().strict();

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

module.exports = {
  sectionCreate, sectionUpdate, questionCreate, questionUpdate, reorder, noteCreate, progressUpdate,
  register, login, profileUpdate, passwordChange, roleUpdate, objectId,
};
