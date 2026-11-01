import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import AuthLayout from '../components/AuthLayout';
import { IconAlert } from '../components/Icons';
import { homePath } from '../components/RequireRole';

export default function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Prihlásený (aj hneď po prihlásení) ide tam, odkiaľ prišiel, inak uchádzač na /jobs a HR na /admin.
  if (user) return <Navigate to={homePath(user, location.state?.from)} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="form" onSubmit={handleSubmit}>
        <header>
          <h2>Prihlásenie</h2>
          <p className="muted">Uchádzači aj HR manažéri sa prihlasujú rovnako.</p>
        </header>
        <label>
          E-mail
          <input
            id="login-email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="meno@firma.sk" required autoFocus
          />
        </label>
        <label>
          Heslo
          <input
            id="login-password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} required
          />
        </label>
        {error && <p className="error" role="alert"><IconAlert size={16} />{error}</p>}
        <button type="submit" disabled={busy}>{busy && <span className="spinner" />}{busy ? 'Prihlasujem…' : 'Prihlásiť sa'}</button>
        <p className="auth-switch">
          Ešte nemáte účet? <Link to="/register" state={location.state}>Zaregistrujte sa</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
