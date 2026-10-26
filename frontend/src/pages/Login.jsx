import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import AuthLayout from '../components/AuthLayout';
import { IconAlert } from '../components/Icons';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from || '/jobs', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
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
          Ešte nemáte účet? <Link to="/register">Zaregistrujte sa</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
