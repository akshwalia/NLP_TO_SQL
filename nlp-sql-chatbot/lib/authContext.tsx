'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { login as apiLogin, register as apiRegister, getCurrentUser } from './api';

// Types
export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_admin: boolean;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName?: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Set up axios interceptor for authentication
  useEffect(() => {
    const interceptor = axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, []);

  // Check if user is logged in on mount
  useEffect(() => {
    async function loadUserFromToken() {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          setLoading(false);
          return;
        }

        const userData = await getCurrentUser();
        setUser(userData);
      } catch (err) {
        console.error('Failed to load user from token:', err);
        localStorage.removeItem('auth_token');
      } finally {
        setLoading(false);
      }
    }

    loadUserFromToken();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      const response = await apiLogin({ username: email, password });
      localStorage.setItem('auth_token', response.access_token);
      
      // Get user data
      const userData = await getCurrentUser();
      setUser(userData);
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      let errorMessage = 'Failed to login';
      if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, firstName: string, lastName?: string) => {
    try {
      setError(null);
      setLoading(true);
      await apiRegister({ email, password, name: `${firstName} ${lastName || ''}`.trim() });
      await login(email, password);
    } catch (err: any) {
      console.error('Registration error:', err);
      let errorMessage = 'Failed to register';
      if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
    router.push('/');
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 