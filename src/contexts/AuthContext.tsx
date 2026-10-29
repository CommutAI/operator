import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { StaffUser } from '../types';

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

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      // Check localStorage for user
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        // Verify user still exists and is active in database
        const { data, error } = await supabase
          .from('staff_users')
          .select('*')
          .eq('id', userData.id)
          .eq('is_active', true)
          .single();

        if (error || !data) {
          localStorage.removeItem('user');
          setUser(null);
        } else {
          setUser(data);
        }
      }
    } catch (error) {
      console.error('Error checking user:', error);
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  const refreshUser = async () => {
    if (user) {
      const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error refreshing user:', error);
      } else if (data) {
        setUser(data);
        localStorage.setItem('user', JSON.stringify(data));
      }
    }
  };

  const signIn = (userData: StaffUser) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

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
