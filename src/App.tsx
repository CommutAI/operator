import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AIMonitoring from './pages/AIMonitoring';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import TripManagement from './pages/TripManagement';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      gcTime: 5 * 60 * 1000, // 5 minutes garbage collection time
      refetchOnReconnect: true,
    },
  },
});

function App() {
  // Keep Render backend alive — ping every 10 minutes to prevent spin-down
  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://sys-admin-62ro.onrender.com';
    const keepAlive = () => {
      fetch(`${backendUrl}/`, { method: 'HEAD', mode: 'no-cors' }).catch(() => {});
    };
    keepAlive();
    const interval = setInterval(keepAlive, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="trips" element={<TripManagement />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="reports" element={<Reports />} />
              <Route path="ai-monitoring" element={<AIMonitoring />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
