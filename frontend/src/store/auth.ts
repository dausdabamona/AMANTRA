import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// User roles as defined in the architecture
export type UserRole = 'user' | 'witness' | 'arbitrator' | 'hisbah' | 'operator';

export type KYCStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  avatar_url: string | null;
  roles: UserRole[];
  kyc_status: KYCStatus;
  created_at: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface AuthState {
  // State
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (identifier: string, password: string) => Promise<void>;
  loginWithOTP: (identifier: string, otp: string) => Promise<void>;
  sendOTP: (identifier: string, type: 'sms' | 'email') => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export interface RegisterData {
  email?: string;
  phone?: string;
  name: string;
  password: string;
}

const initialState = {
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

// API base URL - configurable via environment
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...initialState,

      login: async (identifier: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ identifier, password }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error?.message || 'Login failed');
          }

          set({
            user: data.data.user,
            session: data.data.session,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Login failed',
          });
          throw error;
        }
      },

      loginWithOTP: async (identifier: string, otp: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ identifier, otp }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error?.message || 'OTP verification failed');
          }

          set({
            user: data.data.user,
            session: data.data.session,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'OTP verification failed',
          });
          throw error;
        }
      },

      sendOTP: async (identifier: string, type: 'sms' | 'email') => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/auth/otp/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ identifier, type }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to send OTP');
          }

          set({ isLoading: false });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to send OTP',
          });
          throw error;
        }
      },

      register: async (registerData: RegisterData) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(registerData),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error?.message || 'Registration failed');
          }

          set({
            user: data.data.user,
            session: data.data.session,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Registration failed',
          });
          throw error;
        }
      },

      logout: async () => {
        const { session } = get();
        set({ isLoading: true });

        try {
          if (session?.access_token) {
            await fetch(`${API_BASE_URL}/auth/logout`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
            });
          }
        } catch {
          // Ignore logout errors, still clear local state
        } finally {
          set(initialState);
        }
      },

      refreshSession: async () => {
        const { session } = get();

        if (!session?.refresh_token) {
          set(initialState);
          return;
        }

        try {
          const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh_token: session.refresh_token }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error?.message || 'Session refresh failed');
          }

          set({
            session: data.data.session,
          });
        } catch {
          // If refresh fails, logout
          set(initialState);
        }
      },

      updateProfile: async (profileData: Partial<User>) => {
        const { session, user } = get();

        if (!session?.access_token || !user) {
          throw new Error('Not authenticated');
        }

        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/users/profile`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(profileData),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error?.message || 'Profile update failed');
          }

          set({
            user: { ...user, ...data.data },
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Profile update failed',
          });
          throw error;
        }
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setSession: (session) => set({ session }),
      setError: (error) => set({ error }),
      reset: () => set(initialState),
    }),
    {
      name: 'amantra-auth',
      partialize: (state) => ({
        user: state.user,
        session: state.session,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Helper to get auth headers for API calls
export function getAuthHeaders(): HeadersInit {
  const state = useAuthStore.getState();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (state.session?.access_token) {
    headers['Authorization'] = `Bearer ${state.session.access_token}`;
  }

  return headers;
}

// Helper to check if user has a specific role
export function hasRole(role: UserRole): boolean {
  const state = useAuthStore.getState();
  return state.user?.roles.includes(role) ?? false;
}

// Helper to check if session needs refresh
export function isSessionExpired(): boolean {
  const state = useAuthStore.getState();
  if (!state.session?.expires_at) return true;

  const expiresAt = new Date(state.session.expires_at);
  const now = new Date();
  // Consider expired if less than 5 minutes remaining
  return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
}
