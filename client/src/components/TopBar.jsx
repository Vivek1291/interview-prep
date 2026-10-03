import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useApp } from '../AppContext';
import { useAuth } from '../auth/AuthProvider';
import Avatar from './Avatar';

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="user-menu" ref={ref}>
      <button className="user-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
        <Avatar user={user} size={30} />
      </button>
      {open && (
        <div className="user-dropdown" role="menu">
          <div className="user-dropdown-head">
            <Avatar user={user} size={40} />
            <div><strong>{user.name}</strong><div className="muted small">{user.email}</div>{user.role === 'admin' && <span className="role-pill">🛡️ Admin</span>}</div>
          </div>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)}>⚙️ Settings</Link>
          <button role="menuitem" onClick={logout}>↩ Log out</button>
        </div>
      )}
    </div>
  );
}

export default function TopBar({ onMenu }) {
  const { theme, setTheme, practiceMode, setPracticeMode } = useApp();
  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Toggle menu">☰</button>
      <nav className="topnav">
        <NavLink to="/" end>🏠 Dashboard</NavLink>
        <NavLink to="/revise">⚡ Quick Revise</NavLink>
        <NavLink to="/terms">📖 Terms</NavLink>
      </nav>
      <div className="topbar-right">
        <label className="switch" title="Hide code solutions until you click — practice first!">
          <input type="checkbox" checked={practiceMode} onChange={(e) => setPracticeMode(e.target.checked)} />
          <span className="switch-track" />
          <span className="switch-label">🏋️ Practice</span>
        </label>
        <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
