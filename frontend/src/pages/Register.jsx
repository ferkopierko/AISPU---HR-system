import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePreferences } from '../preferences';
import AuthLayout from '../components/AuthLayout';
import { IconAlert } from '../components/Icons';
import { homePath } from '../components/RequireRole';

// Registrácia vytvorí vždy rolu uchádzač. HR účet sa zakladá skriptom v backend-1.
export default function Register() {
  const { user, register } = useAuth();
  const { t, language } = usePreferences();
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
      setError(err instanceof TypeError ? 'Nepodarilo sa pripojiť. Skúste to znova.' : err.message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="form" onSubmit={handleSubmit}>
        <header>
          <h2>{t('Vytvorte si účet')}</h2>
          <p className="muted">{t('Majte svoje pracovné príležitosti poruke.')}</p>
        </header>
        <label>
          {t('Meno a priezvisko')}
          <input
            id="register-name" type="text" autoComplete="name" value={fullName}
            onChange={(e) => setFullName(e.target.value)} placeholder={language === 'en' ? 'John Smith' : 'Ján Novák'} minLength={2} maxLength={200} required
          />
        </label>
        <label>
          <span>{t('Telefón')} <span className="field-optional">{t('nepovinné')}</span></span>
          <input
            id="register-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="+421 900 123 456" aria-describedby="register-phone-hint"
          />
          <span className="field-hint" id="register-phone-hint">{t('Na kontaktovanie ohľadom vašej prihlášky.')}</span>
        </label>
        <label>
          {t('E-mail')}
          <input
            id="register-email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder={language === 'en' ? 'name@example.com' : 'meno@email.sk'} required
          />
        </label>
        <label>
          {t('Heslo')}
          <input
            id="register-password" type="password" autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} minLength={8} required aria-describedby="register-password-hint"
          />
          <span className="field-hint" id="register-password-hint">{t('Aspoň 8 znakov.')}</span>
        </label>
        <label>
          {t('Heslo znova')}
          <input
            id="register-password2" type="password" autoComplete="new-password" value={password2}
            onChange={(e) => setPassword2(e.target.value)} required
          />
        </label>
        {error && <p className="error" role="alert"><IconAlert size={16} />{t(error)}</p>}
        <button type="submit" disabled={busy}>{busy && <span className="spinner" />}{t(busy ? 'Vytváram účet…' : 'Vytvoriť účet')}</button>
        <p className="auth-switch">
          {t('Už máte účet?')} <Link to="/login" state={location.state}>{t('Prihláste sa')}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
