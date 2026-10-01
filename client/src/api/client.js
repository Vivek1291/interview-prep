import axios from 'axios';

// One configured HTTP client for the whole app (base URL, error normalisation).
export const http = axios.create({ baseURL: '/api', timeout: 30000 });

http.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.message || err.message || 'Request failed';
    return Promise.reject(new Error(message));
  }
);

const data = (r) => r.data.data;

export const api = {
  tree: () => http.get('/sections').then(data),
  createSection: (body) => http.post('/sections', body).then(data),
  updateSection: (id, body) => http.put(`/sections/${id}`, body).then(data),
  deleteSection: (id) => http.delete(`/sections/${id}`),
  reorderSections: (ids) => http.patch('/sections/reorder', { ids }),

  search: (search) => http.get('/questions', { params: { search } }).then(data),
  question: (id) => http.get(`/questions/${id}`).then(data),
  createQuestion: (body) => http.post('/questions', body).then(data),
  updateQuestion: (id, body) => http.put(`/questions/${id}`, body).then(data),
  deleteQuestion: (id) => http.delete(`/questions/${id}`),
  reorderQuestions: (ids, sectionId) => http.patch('/questions/reorder', { ids, sectionId }),

  addQuickNote: (id, body) => http.post(`/questions/${id}/quick-notes`, body).then(data),
  removeQuickNote: (id, noteId) => http.delete(`/questions/${id}/quick-notes/${noteId}`).then(data),
  quickNotes: (section) => http.get('/quick-notes', { params: section ? { section } : {} }).then(data),
  stats: () => http.get('/stats').then(data),

  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return http.post('/uploads', form).then((r) => r.data.url);
  },
  exportBackup: () => http.get('/backup/export').then((r) => r.data),
  importBackup: (json) => http.post('/backup/import', json).then((r) => r.data),
  reset: () => http.post('/backup/reset').then((r) => r.data),
};
