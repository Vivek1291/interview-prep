import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setAccessToken, setSessionExpiredHandler } from '../api/client';

const AuthContext = createContext(null);
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('auth') : null;   // keeps tabs in sync

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'checking', user: null });
  const qc = useQueryClient();

  const endSession = useCallback(() => {
    setAccessToken(null);
    qc.clear();                                           // drop every cached private response
    setState({ status: 'anonymous', user: null });
  }, [qc]);

  const startSession = useCallback(({ accessToken, user }) => {
    setAccessToken(accessToken);
    setState({ status: 'authenticated', user });
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(endSession);
    api.restore().then(startSession).catch(() => setState({ status: 'anonymous', user: null }));   // page load
    const onMessage = (e) => { if (e.data === 'logout') endSession(); };
    channel?.addEventListener('message', onMessage);
    return () => channel?.removeEventListener('message', onMessage);
  }, [endSession, startSession]);

  const value = useMemo(() => ({
    ...state,
    isAdmin: state.user?.role === 'admin',
    login: async (body) => startSession(await api.login(body)),
    register: async (body) => startSession(await api.register(body)),
    logout: async () => {
      await api.logout().catch(() => {});
      endSession();
      channel?.postMessage('logout');
    },
    setUser: (user) => setState((s) => ({ ...s, user })),
  }), [state, startSession, endSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
