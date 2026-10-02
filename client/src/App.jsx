import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import AuthPage from './pages/AuthPage';
import { useAuth } from './auth/AuthProvider';

// Each screen is its own chunk: the browser only downloads the code for the page you open.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const QuestionPage = lazy(() => import('./pages/QuestionPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const RevisePage = lazy(() => import('./pages/RevisePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setSidebarOpen(false), [location.pathname]);

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar />
      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      <div className="main">
        <TopBar onMenu={() => setSidebarOpen((o) => !o)} />
        <main className="content">
          <Suspense fallback={<div className="page"><div className="skeleton" /></div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/c/:id" element={<CategoryPage />} />
              <Route path="/q/:id" element={<QuestionPage />} />
              <Route path="/revise" element={<RevisePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <div className="boot" aria-busy="true">Loading…</div>;
  if (location.pathname === '/login' || location.pathname === '/signup') return <AuthPage />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <AppLayout />;
}
