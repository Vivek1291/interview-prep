import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// Query keys in one place → easy, consistent cache invalidation.
export const keys = {
  tree: ['tree'],
  question: (id) => ['question', id],
  search: (q) => ['search', q],
  stats: ['stats'],
  quickNotes: (s) => ['quickNotes', s || 'all'],
};

export const useTree = () => useQuery({ queryKey: keys.tree, queryFn: api.tree });
export const useQuestion = (id) => useQuery({ queryKey: keys.question(id), queryFn: () => api.question(id), enabled: !!id });
export const useSearch = (q) => useQuery({ queryKey: keys.search(q), queryFn: () => api.search(q), enabled: q.trim().length > 1 });
export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: api.stats });
export const useQuickNotes = (section) => useQuery({ queryKey: keys.quickNotes(section), queryFn: () => api.quickNotes(section) });

function useInvalidate() {
  const qc = useQueryClient();
  return (...extra) => {
    qc.invalidateQueries({ queryKey: keys.tree });
    qc.invalidateQueries({ queryKey: keys.stats });
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
    remove: useMutation({ mutationFn: api.deleteSection, onSuccess: () => invalidate() }),
    reorder: useMutation({ mutationFn: api.reorderSections, onSettled: () => invalidate() }),
  };
}

export function useQuestionMutations() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const setQuestion = (q) => qc.setQueryData(keys.question(q._id), q);
  return {
    create: useMutation({ mutationFn: api.createQuestion, onSuccess: () => invalidate() }),
    update: useMutation({
      mutationFn: ({ id, ...body }) => api.updateQuestion(id, body),
      onSuccess: (q) => { setQuestion(q); invalidate(); },
    }),
    remove: useMutation({ mutationFn: api.deleteQuestion, onSuccess: () => invalidate() }),
    reorder: useMutation({ mutationFn: ({ ids, sectionId }) => api.reorderQuestions(ids, sectionId), onSettled: () => invalidate() }),
    addNote: useMutation({
      mutationFn: ({ id, ...body }) => api.addQuickNote(id, body),
      onSuccess: (q) => { setQuestion(q); invalidate(); },
    }),
    removeNote: useMutation({
      mutationFn: ({ id, noteId }) => api.removeQuickNote(id, noteId),
      onSuccess: (q) => { setQuestion(q); invalidate(); },
    }),
  };
}
