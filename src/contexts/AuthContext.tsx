import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { StaffUser } from '../types';

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

interface AuthContextType {
  user: StaffUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  signIn: (user: StaffUser) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkUser = useCallback(async () => {
    try {
      // Check localStorage for session
      const sessionData = localStorage.getItem('operator_session');
      if (sessionData) {
        const { userId, loginTime } = JSON.parse(sessionData);

        // Check if session has expired
        const now = Date.now();
        if (now - loginTime > SESSION_DURATION) {
          localStorage.removeItem('operator_session');
          setUser(null);
          setLoading(false);
          return;
        }

        // Verify user still exists and is active in database
        const { data, error } = await supabase
          .from('staff_users')
          .select('id, email, full_name, role, is_active, created_at')
          .eq('id', userId)
          .eq('is_active', true)
          .single();

        if (error || !data) {
          localStorage.removeItem('operator_session');
          setUser(null);
        } else {
          setUser(data);
        }
      }
    } catch (error) {
      console.error('Error checking user:', error);
      localStorage.removeItem('operator_session');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  const signOut = useCallback(async () => {
    localStorage.removeItem('operator_session');
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (user) {
      const { data, error } = await supabase
        .from('staff_users')
        .select('id, email, full_name, role, is_active, created_at')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error refreshing user:', error);
      } else if (data) {
        setUser(data);
      }
    }
  }, [user]);

  const signIn = useCallback((userData: StaffUser) => {
    setUser(userData);
    // Store minimal session data: only userId and login time
    localStorage.setItem('operator_session', JSON.stringify({
      userId: userData.id,
      loginTime: Date.now()
    }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refreshUser, signIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
