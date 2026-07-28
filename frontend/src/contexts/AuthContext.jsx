import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

const AuthContext = createContext(null);
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
axios.defaults.withCredentials = true;

const authTokenKey = 'pais_auth_token';

const setAuthToken = (token) => {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete axios.defaults.headers.common.Authorization;
};

const savedToken = localStorage.getItem(authTokenKey);
if (savedToken) {
  setAuthToken(savedToken);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data } = await axios.get('/auth/me');
        setUser(data.data?.user || null);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
        setAuthReady(true);
      }
    };
    fetchUser();
  }, []);

  const login = async (identifier, password, rememberMe) => {
    const { data } = await axios.post('/auth/login', { identifier, password, rememberMe });
    const accessToken = data.data?.accessToken;

    if (accessToken) {
      localStorage.setItem(authTokenKey, accessToken);
      setAuthToken(accessToken);
    }

    setUser(data.data?.user || null);
    toast.success(data.message || 'Welcome back');
    return data;
  };

  const logout = async () => {
    await axios.post('/auth/logout');
    localStorage.removeItem(authTokenKey);
    setAuthToken(null);
    setUser(null);
    toast.success('Signed out');
  };

  const value = useMemo(() => ({ user, loading, authReady, login, logout }), [user, loading, authReady]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
