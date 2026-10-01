import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './pages/Dashboard';
import QuestionPage from './pages/QuestionPage';
import RevisePage from './pages/RevisePage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
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
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/q/:id" element={<QuestionPage />} />
            <Route path="/revise" element={<RevisePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
