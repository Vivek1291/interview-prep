export const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Allow a tiny bit of markdown in quick notes: **bold**, `code`, ==highlight==
export const noteToHtml = (s) =>
  escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>');

export const stripHtml = (html) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
};
