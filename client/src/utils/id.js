// crypto.randomUUID only exists in secure contexts (https / localhost) — fall back otherwise.
export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
