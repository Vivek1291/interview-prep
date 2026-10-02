import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

// Login and sign-up on one page. Server validation messages appear next to the right field.
export default function AuthPage() {
  const { status, login, register } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState(location.pathname === '/signup' ? 'signup' : 'login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const from = location.state?.from || '/';

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      if (mode === 'signup') await register(form);
      else await login({ email: form.email, password: form.password });
    } catch (err) {
      if (err.details?.length) setErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      setMessage(err.details?.length ? 'Please fix the highlighted fields.' : err.message);
    } finally {
      setBusy(false);
    }
  };
  const field = (name, label, props) => (
    <label>
      {label}
      <input name={name} value={form[name]} onChange={set(name)} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-error` : undefined} {...props} />
      {errors[name] && <span id={`${name}-error`} className="field-error">{errors[name]}</span>}
    </label>
  );

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand"><span>🎯</span><div><strong>Learning Hub</strong><div className="muted small">Frontend · Backend · System Design · DevOps · Testing · DSA</div></div></div>
        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log in</button>
          <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Sign up</button>
        </div>
        <form className="form" onSubmit={submit} aria-label={mode === 'login' ? 'Log in' : 'Sign up'}>
          {mode === 'signup' && field('name', 'Name', { autoComplete: 'name', required: true })}
          {field('email', 'Email', { type: 'email', autoComplete: 'email', required: true })}
          {field('password', 'Password', { type: 'password', autoComplete: mode === 'signup' ? 'new-password' : 'current-password', required: true, minLength: mode === 'signup' ? 8 : undefined })}
          {message && <p className="error" role="alert">{message}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          {mode === 'signup' && <p className="muted small">The first account on a new installation becomes the admin.</p>}
        </form>
      </div>
    </div>
  );
}
