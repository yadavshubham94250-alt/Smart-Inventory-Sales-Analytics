import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../api/client';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Holds the logged-in user. On first load, a stored token is verified with GET /auth/me.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(tokenStore.get()));

  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get('/auth/me').then((r) => setUser(r.data.user)).catch(() => tokenStore.clear()).finally(() => setChecking(false));
  }, []);

  // A 401 from any API call (e.g. expired token) logs the user out everywhere.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('sias:unauthorized', onUnauthorized);
    return () => window.removeEventListener('sias:unauthorized', onUnauthorized);
  }, []);

  const authenticate = useCallback(async (path, body) => {
    const r = await api.post(path, body);
    tokenStore.set(r.data.token);
    setUser(r.data.user);
  }, []);
  const login = (email, password) => authenticate('/auth/login', { email, password });
  const register = (name, email, password) => authenticate('/auth/register', { name, email, password });
  const logout = () => { tokenStore.clear(); setUser(null); };

  return <AuthCtx.Provider value={{ user, checking, login, register, logout }}>{children}</AuthCtx.Provider>;
}
