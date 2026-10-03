import axios from 'axios';

// One configured HTTP client for the whole app (base URL, auth header, error normalisation, token refresh).
export const http = axios.create({ baseURL: '/api', timeout: 30000, withCredentials: true });

let accessToken = null;                                   // memory only (not localStorage: safer against XSS)
export const setAccessToken = (t) => { accessToken = t; };
let onSessionExpired = () => {};
export const setSessionExpiredHandler = (fn) => { onSessionExpired = fn; };

export class ApiError extends Error {
  constructor({ message, status, code, details }) {
    super(message);
    Object.assign(this, { name: 'ApiError', status, code, details });
  }
}
const toApiError = (err) => new ApiError({
  message: err.response?.data?.message || (err.response ? err.message : 'Network problem. Check your connection.'),
  status: err.response?.status ?? 0,
  code: err.response?.data?.code,
  details: err.response?.data?.details,
});

// Single flight: if several requests hit "token expired" together, ONE refresh call serves them all
// (refresh tokens rotate, so parallel refreshes would invalidate each other).
let refreshing = null;
export function refreshSession() {
  refreshing ??= axios.post('/api/auth/refresh', null, { withCredentials: true })
    .then((r) => { setAccessToken(r.data.accessToken); return r.data; })
    .catch((err) => { throw toApiError(err); })
    .finally(() => { refreshing = null; });
  return refreshing;
}

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && err.response.data?.code === 'TOKEN_EXPIRED' && !original._retried) {
      original._retried = true;
      try {
        await refreshSession();
      } catch (refreshErr) {
        setAccessToken(null);
        onSessionExpired();
        throw refreshErr;
      }
      return http(original);                              // retry once with the new token
    }
    throw toApiError(err);
  }
);

const data = (r) => r.data.data;

export const api = {
  // auth & account
  login: (body) => http.post('/auth/login', body).then((r) => r.data),
  register: (body) => http.post('/auth/register', body).then((r) => r.data),
  logout: () => http.post('/auth/logout'),
  restore: () => refreshSession(),
  updateProfile: (body) => http.patch('/users/me', body).then((r) => r.data.user),
  changePassword: (body) => http.put('/users/me/password', body).then((r) => setAccessToken(r.data.accessToken)),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);
    return http.post('/users/me/avatar', form).then((r) => r.data.user);
  },
  removeAvatar: () => http.delete('/users/me/avatar').then((r) => r.data.user),
  users: () => http.get('/admin/users').then(data),
  setRole: (id, role) => http.patch(`/admin/users/${id}`, { role }).then((r) => r.data.user),

  // tree
  tree: () => http.get('/sections').then(data),
  createSection: (body) => http.post('/sections', body).then(data),
  updateSection: (id, body) => http.put(`/sections/${id}`, body).then(data),
  deleteSection: (id) => http.delete(`/sections/${id}`).then(data),
  reorderSections: (ids) => http.patch('/sections/reorder', { ids }),

  // pages
  search: (search) => http.get('/questions', { params: { search } }).then(data),
  question: (id) => http.get(`/questions/${id}`).then(data),
  createQuestion: (body) => http.post('/questions', body).then(data),
  updateQuestion: (id, body) => http.put(`/questions/${id}`, body).then(data),
  deleteQuestion: (id) => http.delete(`/questions/${id}`),
  reorderQuestions: (ids) => http.patch('/questions/reorder', { ids }),
  addAuthorNote: (id, body) => http.post(`/questions/${id}/quick-notes`, body).then(data),
  removeAuthorNote: (id, noteId) => http.delete(`/questions/${id}/quick-notes/${noteId}`).then(data),

  // my progress
  setProgress: (id, body) => http.put(`/questions/${id}/progress`, body).then(data),
  addMyNote: (id, body) => http.post(`/questions/${id}/my-notes`, body).then(data),
  removeMyNote: (id, noteId) => http.delete(`/questions/${id}/my-notes/${noteId}`).then(data),
  quickNotes: (node) => http.get('/quick-notes', { params: node ? { node } : {} }).then(data),

  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return http.post('/uploads', form).then((r) => r.data.url);
  },
  // import a prepared document (.docx file or Google Docs link) as categories + pages
  importStart: ({ file, url }, onUploadProgress) => {
    if (url) return http.post('/imports', { url }, { timeout: 0 }).then(data);
    const form = new FormData();
    form.append('file', file);
    return http.post('/imports', form, { timeout: 0, onUploadProgress }).then(data);
  },
  importPreview: (id, rule) => http.post(`/imports/${id}/preview`, { rule }).then(data),
  importCommit: (id, body) => http.post(`/imports/${id}/commit`, body, { timeout: 0 }).then(data),
  importCancel: (id) => http.delete(`/imports/${id}`).catch(() => {}),
  importCommitTabs: (id, body) => http.post(`/imports/${id}/commit-tabs`, body).then(data),
  importStatus: (id) => http.get(`/imports/${id}/status`).then(data),
  importWholeDocument: (id) => http.post(`/imports/${id}/whole-document`, null, { timeout: 0 }).then(data),
  importUseTabs: (id) => http.post(`/imports/${id}/tabs`).then(data),

  // glossary terms
  terms: () => http.get('/terms').then(data),
  term: (id) => http.get(`/terms/${id}`).then(data),
  createTerm: (body) => http.post('/terms', body).then(data),
  updateTerm: (id, body) => http.put(`/terms/${id}`, body).then(data),
  deleteTerm: (id) => http.delete(`/terms/${id}`),

  exportBackup: () => http.get('/backup/export').then((r) => r.data),
  importBackup: (json) => http.post('/backup/import', json).then((r) => r.data),
  reset: () => http.post('/backup/reset').then((r) => r.data),
};
