import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LiveOperations from './pages/LiveOperations';
import Buses from './pages/Buses';
import AIMonitoring from './pages/AIMonitoring';
import Transactions from './pages/Transactions';
import Baggage from './pages/Baggage';
import Revenue from './pages/Revenue';
import Announcements from './pages/Announcements';
import Reports from './pages/Reports';
import ActivityLog from './pages/ActivityLog';
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
              <Route path="live-operations" element={<LiveOperations />} />
              <Route path="buses" element={<Buses />} />
              <Route path="ai-monitoring" element={<AIMonitoring />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="baggage" element={<Baggage />} />
              <Route path="revenue" element={<Revenue />} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="reports" element={<Reports />} />
              <Route path="activity-log" element={<ActivityLog />} />
              <Route path="video-monitoring" element={<VideoMonitoring />} />
              <Route path="live-map" element={<LiveMap />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
