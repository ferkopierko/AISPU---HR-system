import { useState } from 'react';
import { auth as authApi } from '../api';
import { useAuth } from '../auth';
import { IconAlert, IconCheck } from '../components/Icons';

// Môj profil – meno a telefón (PUT /api/auth/me) a zmena hesla (PUT /api/auth/me/password).
export default function Profile() {
  const { user } = useAuth();
  return (
    <>
      <header className="page-head">
        <div>
          <span className="eyebrow">{user.role === 'admin' ? 'HR manažér' : 'Uchádzač'}</span>
          <h1>Môj profil</h1>
          <p className="muted">E-mail slúži na prihlásenie a nedá sa zmeniť.</p>
        </div>
      </header>
      <div className="profile">
        <ProfileForm />
        <PasswordForm />
      </div>
    </>
  );
}

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(user.fullName ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [state, setState] = useState({ busy: false, error: '', saved: false });

  async function handleSubmit(e) {
    e.preventDefault();
    setState({ busy: true, error: '', saved: false });
    try {
      await updateProfile({ fullName, phone: phone.trim() || undefined });
      setState({ busy: false, error: '', saved: true });
    } catch (err) {
      setState({ busy: false, error: err.message, saved: false });
    }
  }

  const changed = fullName !== (user.fullName ?? '') || phone !== (user.phone ?? '');
  return (
    <section className="profile-section" aria-labelledby="profile-data">
      <div className="profile-intro">
        <h2 id="profile-data">Osobné údaje</h2>
        <p className="muted">Meno a telefón uvidí HR pri vašich prihláškach.</p>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          E-mail
          <input id="profile-email" type="email" value={user.email} readOnly disabled />
        </label>
        <label>
          Meno a priezvisko
          <input
            id="profile-name" type="text" autoComplete="name" value={fullName} minLength={2} maxLength={200} required
            onChange={(e) => { setFullName(e.target.value); setState((s) => ({ ...s, saved: false })); }}
          />
        </label>
        <label>
          <span>Telefón <span className="field-optional">nepovinné</span></span>
          <input
            id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} placeholder="+421 900 123 456"
            onChange={(e) => { setPhone(e.target.value); setState((s) => ({ ...s, saved: false })); }}
          />
          <span className="field-hint">Ak pole vymažete, telefón sa z profilu odstráni.</span>
        </label>
        {state.error && <p className="error" role="alert"><IconAlert size={16} />{state.error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={state.busy || !changed}>
            {state.busy && <span className="spinner" />}{state.busy ? 'Ukladám…' : 'Uložiť zmeny'}
          </button>
          {state.saved && <span className="success" role="status"><IconCheck size={16} />Uložené</span>}
        </div>
      </form>
    </section>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [state, setState] = useState({ busy: false, error: '', saved: false });

  async function handleSubmit(e) {
    e.preventDefault();
    if (next !== next2) return setState({ busy: false, error: 'Nové heslá sa nezhodujú', saved: false });
    setState({ busy: true, error: '', saved: false });
    try {
      await authApi.changePassword(current, next);
      setCurrent(''); setNext(''); setNext2('');
      setState({ busy: false, error: '', saved: true });
    } catch (err) {
      setState({ busy: false, error: err.message, saved: false });
    }
  }

  return (
    <section className="profile-section" aria-labelledby="profile-password">
      <div className="profile-intro">
        <h2 id="profile-password">Zmena hesla</h2>
        <p className="muted">Po zmene zostanete prihlásení. Staré heslo prestane platiť.</p>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Súčasné heslo
          <input id="password-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label>
          Nové heslo
          <input
            id="password-new" type="password" autoComplete="new-password" value={next} minLength={8} required
            onChange={(e) => setNext(e.target.value)} aria-describedby="password-new-hint"
          />
          <span className="field-hint" id="password-new-hint">Aspoň 8 znakov, iné ako súčasné.</span>
        </label>
        <label>
          Nové heslo znova
          <input id="password-new2" type="password" autoComplete="new-password" value={next2} onChange={(e) => setNext2(e.target.value)} required />
        </label>
        {state.error && <p className="error" role="alert"><IconAlert size={16} />{state.error}</p>}
        <div className="form-actions">
          <button type="submit" className="secondary" disabled={state.busy}>
            {state.busy && <span className="spinner" />}{state.busy ? 'Mením heslo…' : 'Zmeniť heslo'}
          </button>
          {state.saved && <span className="success" role="status"><IconCheck size={16} />Heslo je zmenené</span>}
        </div>
      </form>
    </section>
  );
}
