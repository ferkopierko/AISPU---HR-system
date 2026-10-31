import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import AuthLayout from '../components/AuthLayout';
import { IconAlert } from '../components/Icons';

// Registrácia vytvorí vždy rolu uchádzač. HR účet sa zakladá skriptom v backend-1.
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== password2) return setError('Heslá sa nezhodujú');
    setError('');
    setBusy(true);
    try {
      await register(email, password);
      navigate(location.state?.from?.startsWith('/jobs/') ? location.state.from : '/jobs', { replace: true });
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
          <h2>Nový účet uchádzača</h2>
          <p className="muted">HR účty zakladá administrátor, tu sa registrujú len uchádzači.</p>
        </header>
        <label>
          E-mail
          <input
            id="register-email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="meno@email.sk" required autoFocus
          />
        </label>
        <label>
          Heslo
          <input
            id="register-password" type="password" autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} minLength={8} required aria-describedby="register-password-hint"
          />
          <span className="field-hint" id="register-password-hint">Aspoň 8 znakov.</span>
        </label>
        <label>
          Heslo znova
          <input
            id="register-password2" type="password" autoComplete="new-password" value={password2}
            onChange={(e) => setPassword2(e.target.value)} required
          />
        </label>
        {error && <p className="error" role="alert"><IconAlert size={16} />{error}</p>}
        <button type="submit" disabled={busy}>{busy && <span className="spinner" />}{busy ? 'Vytváram účet…' : 'Vytvoriť účet'}</button>
        <p className="auth-switch">
          Už máte účet? <Link to="/login">Prihláste sa</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
