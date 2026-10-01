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

const sectionCreate = z.object({
  title: z.string().trim().min(1).max(120),
  icon: z.string().max(8).optional(),
  color: z.string().optional(),
  description: z.string().optional(),
});
const sectionUpdate = sectionCreate.partial();

const questionCreate = z.object({
  section: objectId,
  title: z.string().trim().min(1),
  priority: z.number().int().min(1).max(3).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['new', 'learning', 'revise', 'confident']).optional(),
  starred: z.boolean().optional(),
  blocks: z.array(block).optional(),
  quickNotes: z.array(quickNote).optional(),
});
const questionUpdate = questionCreate.partial();

const reorder = z.object({
  ids: z.array(objectId).min(1),
  sectionId: objectId.optional(),
});

const quickNoteCreate = z.object({
  text: z.string().trim().min(1),
  color: z.string().optional(),
});

module.exports = { sectionCreate, sectionUpdate, questionCreate, questionUpdate, reorder, quickNoteCreate };
