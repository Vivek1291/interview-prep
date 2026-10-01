import { NavLink } from 'react-router-dom';
import { useApp } from '../AppContext';

export default function TopBar({ onMenu }) {
  const { theme, setTheme, practiceMode, setPracticeMode } = useApp();
  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Toggle menu">☰</button>
      <nav className="topnav">
        <NavLink to="/" end>🏠 Dashboard</NavLink>
        <NavLink to="/revise">⚡ Quick Revise</NavLink>
        <NavLink to="/settings">⚙️ Settings</NavLink>
      </nav>
      <div className="topbar-right">
        <label className="switch" title="Hide code solutions until you click — practice first!">
          <input type="checkbox" checked={practiceMode} onChange={(e) => setPracticeMode(e.target.checked)} />
          <span className="switch-track" />
          <span>🏋️ Practice mode</span>
        </label>
        <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
}
