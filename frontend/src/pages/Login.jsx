import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePreferences } from '../preferences';
import AuthLayout from '../components/AuthLayout';
import { IconAlert } from '../components/Icons';
import { homePath } from '../components/RequireRole';

export default function Login() {
  const { user, login } = useAuth();
  const { t, language } = usePreferences();
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
      setError(err instanceof TypeError ? 'Nepodarilo sa pripojiť. Skúste to znova.' : err.message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="form" onSubmit={handleSubmit}>
        <header>
          <h2>{t('Prihlásenie')}</h2>
          <p className="muted">{t('Vitajte späť. Prihláste sa do svojho účtu.')}</p>
        </header>
        <label>
          {t('E-mail')}
          <input
            id="login-email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder={language === 'en' ? 'name@company.com' : 'meno@firma.sk'} required
          />
        </label>
        <label>
          {t('Heslo')}
          <input
            id="login-password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} required
          />
        </label>
        {error && <p className="error" role="alert"><IconAlert size={16} />{t(error)}</p>}
        <button type="submit" disabled={busy}>{busy && <span className="spinner" />}{t(busy ? 'Prihlasujem…' : 'Prihlásiť sa')}</button>
        <p className="auth-switch">
          {t('Ešte nemáte účet?')} <Link to="/register" state={location.state}>{t('Zaregistrujte sa')}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
