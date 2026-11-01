import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Po obnovení stránky zistí, či session ešte platí.
  useEffect(() => {
    auth.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const value = {
    user,
    loading,
    login: async (email, password) => setUser(await auth.login(email, password)),
    register: async (data) => setUser(await auth.register(data)),
    updateProfile: async (data) => setUser(await auth.updateMe(data)),
    logout: async () => {
      await auth.logout();
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
