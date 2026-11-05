import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePreferences } from '../preferences';
import AuthLayout from '../components/AuthLayout';
import { IconAlert } from '../components/Icons';
import { homePath } from '../components/RequireRole';
import { CANDIDATE_URL, HR_URL, IS_HR } from '../portal';

export default function Login() {
  const { user, login } = useAuth();
  const { t, language } = usePreferences();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrongPortal, setWrongPortal] = useState(false); // 403 – účet patrí do druhého portálu

  // Prihlásený (aj hneď po prihlásení) ide tam, odkiaľ prišiel, inak na úvod portálu (/jobs, v HR /applications).
  if (user) return <Navigate to={homePath(user, location.state?.from)} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setWrongPortal(false);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setWrongPortal(err.status === 403);
      setError(err instanceof TypeError ? 'Nepodarilo sa pripojiť. Skúste to znova.' : err.message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="form" onSubmit={handleSubmit}>
        <header>
          <h2>{IS_HR ? 'Prihlásenie do HR portálu' : t('Prihlásenie')}</h2>
          <p className="muted">{IS_HR ? 'Pre HR manažérov a správcov systému.' : t('Vitajte späť. Prihláste sa do svojho účtu.')}</p>
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
        {error && (
          <p className="error" role="alert">
            <IconAlert size={16} />
            <span>
              {t(error)}
              {wrongPortal && (IS_HR
                ? <> <a href={CANDIDATE_URL}>Prejsť do portálu uchádzača</a></>
                : <> <a href={`${HR_URL}/login`}>Prejsť do HR portálu</a></>)}
            </span>
          </p>
        )}
        <button type="submit" disabled={busy}>{busy && <span className="spinner" />}{t(busy ? 'Prihlasujem…' : 'Prihlásiť sa')}</button>
        {/* HR účty zakladá správca systému, registrácia je iba v portáli uchádzača */}
        {!IS_HR && (
          <p className="auth-switch">
            {t('Ešte nemáte účet?')} <Link to="/register" state={location.state}>{t('Zaregistrujte sa')}</Link>
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
