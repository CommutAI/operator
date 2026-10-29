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
import Announcements from './pages/Announcements';
import Reports from './pages/Reports';
import VideoMonitoring from './pages/VideoMonitoring';
import LiveMap from './pages/LiveMap';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function App() {
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
              <Route path="ai-monitoring" element={<AIMonitoring />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="reports" element={<Reports />} />
              <Route path="video-monitoring" element={<VideoMonitoring />} />
              <Route path="live-map" element={<LiveMap />} />
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
