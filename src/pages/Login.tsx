import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react';
import bcrypt from 'bcryptjs';
import { StaffUser } from '../types';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const hasEmail = email.length > 0;
  const hasPassword = password.length > 0;

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string): boolean => {
    return password.length >= 6;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate inputs
    if (!email || !validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!password || !validatePassword(password)) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      // Try Supabase Auth first
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        // If Supabase Auth fails, try custom password in staff_users table
        const { data: user, error: fetchError } = await supabase
          .from('staff_users')
          .select('id, full_name, email, role, is_active, created_at, password')
          .eq('email', email)
          .eq('is_active', true)
          .single();

        if (fetchError || !user) {
          throw new Error('Invalid email or password');
        }

        // Check if password exists and verify it
        if (!user.password) {
          throw new Error('No password set for this account');
        }

        // Check if password is hashed (bcrypt hashes start with $2a$ or $2b$)
        const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');

        let passwordMatch = false;

        if (isHashed) {
          // Compare with bcrypt
          passwordMatch = await bcrypt.compare(password, user.password);
        } else {
          // Plain text comparison (legacy - will upgrade on successful login)
          passwordMatch = password === user.password;

          // Upgrade to bcrypt on successful login
          if (passwordMatch) {
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            await supabase
              .from('staff_users')
              .update({ password: hashedPassword })
              .eq('id', user.id);
          }
        }

        if (!passwordMatch) {
          throw new Error('Invalid email or password');
        }

        // Update last_login_at
        await supabase
          .from('staff_users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', user.id);

        // Remove password from user object before storing
        const { password: _, ...userWithoutPassword } = user as any;

        // Sign in using AuthContext to update state immediately
        signIn(userWithoutPassword as StaffUser);
      } else {
        // Supabase Auth succeeded - get staff user data
        const { data: staffUser, error: staffError } = await supabase
          .from('staff_users')
          .select('id, full_name, email, role, is_active, created_at')
          .eq('id', authData.user.id)
          .eq('is_active', true)
          .single();

        if (staffError || !staffUser) {
          throw new Error('User account not found or inactive');
        }

        // Update last_login_at
        await supabase
          .from('staff_users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', staffUser.id);

        // Sign in using AuthContext
        signIn(staffUser);
      }

      // Navigate to home/dashboard on successful login
      navigate('/');
    } catch (error: any) {
      console.error('Login failed:', error);
      setError(error.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <img 
            src="/logo.png" 
            alt="CommutAI Logo" 
            className="w-20 h-20 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-white mb-2">CommutAI</h1>
          <p className="text-white/60">Operator Dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              Email
            </label>
            <div className="relative">
              <Mail className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 transition-colors ${hasEmail ? 'text-orange-500' : 'text-white/40'}`} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                placeholder="operator@commutai.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 transition-colors ${hasPassword ? 'text-orange-500' : 'text-white/40'}`} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 transition-colors ${hasPassword ? 'text-orange-500 hover:text-orange-400' : 'text-white/40 hover:text-white/60'}`}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              'Signing in...'
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="text-center text-white/40 text-sm mt-6">
          OMANFORTSCO Transportation Operations
        </p>
      </div>
    </div>
  );
}
