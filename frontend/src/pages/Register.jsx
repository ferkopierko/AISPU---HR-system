import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import AuthLayout from '../components/AuthLayout';
import { IconAlert } from '../components/Icons';
import { homePath } from '../components/RequireRole';

// Registrácia vytvorí vždy rolu uchádzač. HR účet sa zakladá skriptom v backend-1.
export default function Register() {
  const { user, register } = useAuth();
  const location = useLocation();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Prihlásený (aj hneď po registrácii) ide preč – späť na pozíciu, odkiaľ prišiel, inak domov.
  if (user) return <Navigate to={homePath(user, location.state?.from)} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== password2) return setError('Heslá sa nezhodujú');
    setError('');
    setBusy(true);
    try {
      await register({ email, password, fullName, phone: phone.trim() || undefined });
    } catch (err) {
      setError(err.message);
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
          Meno a priezvisko
          <input
            id="register-name" type="text" autoComplete="name" value={fullName}
            onChange={(e) => setFullName(e.target.value)} placeholder="Ján Novák" minLength={2} maxLength={200} required autoFocus
          />
        </label>
        <label>
          <span>Telefón <span className="field-optional">nepovinné</span></span>
          <input
            id="register-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="+421 900 123 456" aria-describedby="register-phone-hint"
          />
          <span className="field-hint" id="register-phone-hint">HR vás môže kontaktovať aj telefonicky.</span>
        </label>
        <label>
          E-mail
          <input
            id="register-email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="meno@email.sk" required
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
          Už máte účet? <Link to="/login" state={location.state}>Prihláste sa</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
