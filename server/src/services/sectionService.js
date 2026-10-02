// Service = business logic. Knows nothing about req/res (HTTP) — easy to unit test.
// Sections are the nodes of the navigation tree (any depth).
const sectionRepository = require('../repositories/sectionRepository');
const questionRepository = require('../repositories/questionRepository');
const progressRepository = require('../repositories/progressRepository');
const ApiError = require('../utils/ApiError');
const { visibleFilter, canEdit, ownerFor, assertCanPlaceIn, assertCanEdit, isVisible } = require('./access');
const { recoverOrphans } = require('./maintenance');

/** ids of `rootId` and all its descendants, given a flat node list */
function subtreeIds(nodes, rootId) {
  const children = new Map();
  for (const n of nodes) {
    const p = String(n.parent ?? '');
    children.set(p, [...(children.get(p) || []), String(n._id)]);
  }
  const out = [];
  const stack = [String(rootId)];
  while (stack.length) {
    const id = stack.pop();
    out.push(id);
    stack.push(...(children.get(id) || []));
  }
  return out;
}

const sectionService = {
  subtreeIds,

  /** Everything the sidebar needs: visible nodes + light page summaries with this user's progress. */
  async getTree(user) {
    const visible = visibleFilter(user);
    const [nodes, pages, progress] = await Promise.all([
      sectionRepository.find(visible),
      questionRepository.findSummaries(visible),
      progressRepository.findForUser(user.id),
    ]);
    const mine = new Map(progress.map((p) => [String(p.question), p]));
    return {
      nodes: nodes.map((n) => ({ ...n, canEdit: canEdit(user, n) })),
      pages: pages.map((p) => ({
        ...p,
        status: mine.get(String(p._id))?.status || 'new',
        starred: mine.get(String(p._id))?.starred || false,
        canEdit: canEdit(user, p),
      })),
    };
  },

  async get(user, id) {
    const node = await sectionRepository.findById(id);
    if (!isVisible(user, node)) throw ApiError.notFound('Category not found');
    return { ...node, canEdit: canEdit(user, node) };
  },

  async create(user, { parent = null, ...data }) {
    const owner = ownerFor(user);
    const parentNode = parent ? await sectionRepository.findById(parent) : null;
    if (parent && !parentNode) throw ApiError.notFound('Category not found');
    assertCanPlaceIn(user, parentNode, owner);
    const order = (await sectionRepository.maxOrder(parent)) + 1;
    const node = await sectionRepository.create({ ...data, parent, owner, order });
    return { ...node.toObject(), canEdit: true };
  },

  async update(user, id, data) {
    const node = await sectionRepository.findById(id);
    assertCanEdit(user, node, 'category');
    if ('parent' in data && String(data.parent ?? '') !== String(node.parent ?? '')) {
      if (data.parent) {
        const newParent = await sectionRepository.findById(data.parent);
        if (!newParent) throw ApiError.notFound('Category not found');
        assertCanPlaceIn(user, newParent, node.owner);
        const all = await sectionRepository.find(visibleFilter(user));
        if (subtreeIds(all, id).includes(String(data.parent))) throw ApiError.badRequest('A category cannot be moved inside itself');
      }
      data.order = (await sectionRepository.maxOrder(data.parent ?? null)) + 1;   // append at the end of the new parent
    }
    const updated = await sectionRepository.update(id, data);
    return { ...updated, canEdit: true };
  },

  /**
   * Delete a category and everything in it that belongs to the same owner.
   * Other users' private items inside a shared category are NOT deleted: recoverOrphans() rescues them.
   */
  async remove(user, id) {
    const node = await sectionRepository.findById(id);
    assertCanEdit(user, node, 'category');
    const all = await sectionRepository.findAll();
    const ids = subtreeIds(all, id);
    const sameOwner = { owner: node.owner ?? null };
    const deleted = await sectionRepository.deleteMany({ _id: { $in: ids }, ...sameOwner });
    const pages = await questionRepository.deleteMany({ section: { $in: ids }, ...sameOwner });
    const recovered = await recoverOrphans();
    return { categories: deleted.deletedCount, pages: pages.deletedCount, recovered };
  },

  /** Reorder siblings. Everyone may reorder their own items; only admins reorder shared ones. */
  async reorder(user, ids) {
    const nodes = await sectionRepository.find({ _id: { $in: ids } });
    if (nodes.length !== ids.length) throw ApiError.notFound('Category not found');
    if (new Set(nodes.map((n) => String(n.parent ?? ''))).size > 1) throw ApiError.badRequest('Categories must share the same parent');
    if (nodes.some((n) => !canEdit(user, n))) throw ApiError.forbidden('Only admins can reorder shared categories');
    await sectionRepository.reorder(ids);
  },
};

module.exports = sectionService;
