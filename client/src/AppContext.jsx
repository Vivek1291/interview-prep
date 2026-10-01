import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from './utils/storage';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => storage.get('theme', 'light'));
  const [practiceMode, setPracticeMode] = useState(() => storage.get('practiceMode', false));
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storage.set('theme', theme);
  }, [theme]);
  useEffect(() => storage.set('practiceMode', practiceMode), [practiceMode]);

  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, type }]); // max 4 visible
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, practiceMode, setPracticeMode, toast }),
    [theme, practiceMode, toast]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
