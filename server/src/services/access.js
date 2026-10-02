// Who may see and change what. Used by every service so the rules live in ONE place.
//   owner = null  → common content: everyone sees it, only admins change it
//   owner = user  → private content: only that user sees and changes it
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const isAdmin = (user) => user?.role === 'admin';

/** Mongo filter for documents the user may see. */
const visibleFilter = (user) => ({ $or: [{ owner: null }, { owner: oid(user.id) }] });

const isVisible = (user, doc) => !!doc && (doc.owner == null || String(doc.owner) === String(user.id));

const canEdit = (user, doc) => !!doc && (doc.owner == null ? isAdmin(user) : String(doc.owner) === String(user.id));

/** Owner for content the user creates: admins create common content, everyone else private content. */
const ownerFor = (user) => (isAdmin(user) ? null : oid(user.id));

/**
 * Can `user` put a NEW item with `owner` inside container `parent`?
 * - parent must be visible to the user
 * - common content may only live inside common containers (otherwise other users couldn't reach it)
 */
function assertCanPlaceIn(user, parent, owner) {
  if (!parent) return;
  if (!isVisible(user, parent)) throw ApiError.notFound('Category not found');
  if (owner == null && parent.owner != null) throw ApiError.badRequest('Shared content cannot be placed inside a private category');
}

function assertCanEdit(user, doc, what = 'item') {
  if (!isVisible(user, doc)) throw ApiError.notFound(`${what[0].toUpperCase()}${what.slice(1)} not found`);
  if (!canEdit(user, doc)) throw ApiError.forbidden(`Only admins can change shared ${what}s`);
}

module.exports = { oid, isAdmin, visibleFilter, isVisible, canEdit, ownerFor, assertCanPlaceIn, assertCanEdit };
