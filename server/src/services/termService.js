// Glossary terms: shared (admin) or private, like pages. See models/Term.js.
const termRepository = require('../repositories/termRepository');
const ApiError = require('../utils/ApiError');
const { visibleFilter, isVisible, canEdit, ownerFor, assertCanEdit } = require('./access');

const cleanAliases = (aliases = [], term = '') => [...new Set(aliases.map((a) => a.trim()).filter((a) => a && a.toLowerCase() !== term.trim().toLowerCase()))];

const termService = {
  async list(user) {
    const terms = await termRepository.list(visibleFilter(user));
    return terms.map((t) => ({ ...t, canEdit: canEdit(user, t) }));
  },

  async get(user, id) {
    const t = await termRepository.findById(id);
    if (!isVisible(user, t)) throw ApiError.notFound('Term not found');
    return { ...t, canEdit: canEdit(user, t) };
  },

  async create(user, data) {
    const owner = ownerFor(user);
    if (await termRepository.findSameName(owner, data.term)) throw ApiError.conflict(`“${data.term}” already exists`);
    const t = await termRepository.create({ ...data, aliases: cleanAliases(data.aliases, data.term), owner });
    return { ...t.toObject(), canEdit: true };
  },

  async update(user, id, data) {
    const t = await termRepository.findById(id);
    assertCanEdit(user, t, 'term');
    const name = data.term ?? t.term;
    if (data.term && (await termRepository.findSameName(t.owner, data.term, id))) throw ApiError.conflict(`“${data.term}” already exists`);
    if (data.aliases || data.term) data.aliases = cleanAliases(data.aliases ?? t.aliases, name);
    const updated = await termRepository.update(id, data);
    return { ...updated, canEdit: true };
  },

  async remove(user, id) {
    const t = await termRepository.findById(id);
    assertCanEdit(user, t, 'term');
    await termRepository.delete(id);
  },
};

module.exports = termService;
