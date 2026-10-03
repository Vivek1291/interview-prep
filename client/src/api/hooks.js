import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { buildTree } from '../utils/tree';

// Query keys in one place → easy, consistent cache invalidation.
export const keys = {
  tree: ['tree'],
  question: (id) => ['question', id],
  search: (q) => ['search', q],
  quickNotes: (n) => ['quickNotes', n || 'all'],
  users: ['users'],
  terms: ['terms'],
  term: (id) => ['term', id],
};

// buildTree links nodes both ways (children ↔ path), so the result has cycles: React Query's
// structural sharing would deep-walk them forever on refetch. Each refetch builds a fresh tree instead.
export const useTree = () => useQuery({ queryKey: keys.tree, queryFn: api.tree, select: buildTree, structuralSharing: false });
export const useQuestion = (id) => useQuery({ queryKey: keys.question(id), queryFn: () => api.question(id), enabled: !!id });
export const useSearch = (q) => useQuery({ queryKey: keys.search(q), queryFn: () => api.search(q), enabled: q.trim().length > 1 });
export const useQuickNotes = (node) => useQuery({ queryKey: keys.quickNotes(node), queryFn: () => api.quickNotes(node) });
export const useTerms = () => useQuery({ queryKey: keys.terms, queryFn: api.terms, staleTime: 60 * 1000 });
export const useTerm = (id) => useQuery({ queryKey: keys.term(id), queryFn: () => api.term(id), enabled: !!id });
export function useTermMutations() {
  const qc = useQueryClient();
  const done = (id) => { qc.invalidateQueries({ queryKey: keys.terms }); if (id) qc.invalidateQueries({ queryKey: keys.term(id) }); };
  return {
    create: useMutation({ mutationFn: api.createTerm, onSuccess: (t) => done(t._id) }),
    update: useMutation({ mutationFn: ({ id, ...body }) => api.updateTerm(id, body), onSuccess: (t) => { qc.setQueryData(keys.term(t._id), t); done(); } }),
    remove: useMutation({ mutationFn: api.deleteTerm, onSuccess: (_, id) => { qc.removeQueries({ queryKey: keys.term(id) }); done(); } }),
  };
}
export const useUsers = (enabled) => useQuery({ queryKey: keys.users, queryFn: api.users, enabled });

function useInvalidate() {
  const qc = useQueryClient();
  return (...extra) => {
    qc.invalidateQueries({ queryKey: keys.tree });
    qc.invalidateQueries({ queryKey: ['quickNotes'] });
    qc.invalidateQueries({ queryKey: ['search'] });
    extra.forEach((k) => qc.invalidateQueries({ queryKey: k }));
  };
}

export function useSectionMutations() {
  const invalidate = useInvalidate();
  return {
    create: useMutation({ mutationFn: api.createSection, onSuccess: () => invalidate() }),
    update: useMutation({ mutationFn: ({ id, ...body }) => api.updateSection(id, body), onSuccess: () => invalidate() }),
    remove: useMutation({ mutationFn: api.deleteSection, onSuccess: () => invalidate(['question']) }),
    reorder: useMutation({ mutationFn: api.reorderSections, onSettled: () => invalidate() }),
  };
}

export function useQuestionMutations() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const setQuestion = (q) => qc.setQueryData(keys.question(q._id), q);
  // progress endpoints return only the progress part: merge it into the cached page
  const setProgress = (id) => (progress) => qc.setQueryData(keys.question(id), (old) => (old ? { ...old, progress } : old));
  return {
    create: useMutation({ mutationFn: api.createQuestion, onSuccess: () => invalidate() }),
    update: useMutation({ mutationFn: ({ id, ...body }) => api.updateQuestion(id, body), onSuccess: (q) => { setQuestion(q); invalidate(); } }),
    remove: useMutation({ mutationFn: api.deleteQuestion, onSuccess: () => invalidate() }),
    reorder: useMutation({ mutationFn: api.reorderQuestions, onSettled: () => invalidate() }),
    addAuthorNote: useMutation({ mutationFn: ({ id, ...body }) => api.addAuthorNote(id, body), onSuccess: (q) => { setQuestion(q); invalidate(); } }),
    removeAuthorNote: useMutation({ mutationFn: ({ id, noteId }) => api.removeAuthorNote(id, noteId), onSuccess: (q) => { setQuestion(q); invalidate(); } }),
    progress: useMutation({ mutationFn: ({ id, ...body }) => api.setProgress(id, body), onSuccess: (p, v) => { setProgress(v.id)(p); invalidate(); } }),
    addMyNote: useMutation({ mutationFn: ({ id, ...body }) => api.addMyNote(id, body), onSuccess: (p, v) => { setProgress(v.id)(p); invalidate(); } }),
    removeMyNote: useMutation({ mutationFn: ({ id, noteId }) => api.removeMyNote(id, noteId), onSuccess: (p, v) => { setProgress(v.id)(p); invalidate(); } }),
  };
}
