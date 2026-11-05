import { useEffect, useState } from 'react';
import { system } from '../api';
import { useAuth } from '../auth';
import { IconAlert, IconCheck, IconSearch, IconUsers } from '../components/Icons';
import { initials } from '../components/Layout';
import { formatDateTime } from '../labels';

const ROLES = { user: 'Uchádzač', admin: 'HR manažér', sysadmin: 'Správca systému' };
export default function SystemUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState(null);
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    const [accounts, changes] = await Promise.all([system.users(), system.history()]);
    setUsers(accounts); setHistory(changes);
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);
  async function saveRole() {
    setBusy(true); setError(''); setNotice('');
    try {
      await system.setRole(pending.account.id, pending.role, pending.account.role);
      setNotice(`Rola účtu ${pending.account.email} bola zmenená na „${ROLES[pending.role]}“.`);
      setPending(null);
      await load();
    } catch (err) {
      setError(err.message);
      if (err.status === 409) { setPending(null); await load().catch(() => {}); }
    } finally { setBusy(false); }
  }
  const q = query.trim().toLocaleLowerCase('sk');
  const visible = (users ?? []).filter((account) => [account.email, account.fullName].some((text) => text?.toLocaleLowerCase('sk').includes(q)));
  return <>
    <header className="page-head"><div><h1>Správa používateľov</h1></div></header>
    <div className="role-guide">
      <div><strong>Uchádzač</strong><p>Vlastný profil, životopis a prihlášky.</p></div>
      <div><strong>HR manažér</strong><p>Pozície, uchádzači a priebeh náboru.</p></div>
      <div><strong>Správca systému</strong><p>Všetky HR funkcie a prideľovanie rolí.</p></div>
    </div>
    {error && <p className="error notice" role="alert"><IconAlert size={16} />{error}</p>}
    {notice && <p className="success notice" role="status"><IconCheck size={16} />{notice}</p>}
    <div className="jobs-searchbar"><h2>Používateľské účty {users && <span className="muted">({users.length})</span>}</h2><label className="search"><IconSearch size={16} /><span className="visually-hidden">Hľadať používateľa</span><input type="search" placeholder="Meno alebo e-mail" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
    {pending && <section className="role-confirm" aria-label="Potvrdenie zmeny roly">
      <h2>Zmeniť oprávnenia účtu?</h2><p><strong>{pending.account.email}</strong>: {ROLES[pending.account.role]} → {ROLES[pending.role]}</p>
      <p className="muted">{pending.role === 'sysadmin' ? 'Používateľ získa prístup k správe všetkých účtov a ich rolí.' : pending.role === 'admin' ? 'Používateľ získa prístup k všetkým prihláškam a životopisom.' : 'Používateľ bude mať prístup iba k vlastným údajom a prihláškam.'}</p>
      <div className="form-actions"><button onClick={saveRole} disabled={busy}>{busy ? 'Ukladám…' : 'Potvrdiť zmenu roly'}</button><button className="secondary" disabled={busy} onClick={() => setPending(null)}>Zrušiť</button></div>
    </section>}
    {!users && !error && <p className="muted" role="status">Načítavam používateľov…</p>}
    {users && visible.length === 0 && <div className="empty"><IconUsers /><strong>Žiadny používateľ nezodpovedá hľadaniu.</strong><button className="secondary" onClick={() => setQuery('')}>Zrušiť hľadanie</button></div>}
    {visible.length > 0 && <div className="table-scroll"><table className="table"><thead><tr><th>Používateľ</th><th>Rola</th><th>Prístup</th></tr></thead><tbody>{visible.map((account) => <tr key={account.id}>
      <td><div className="who"><span className="avatar" aria-hidden="true">{initials(account.fullName || account.email)}</span><div><strong className="cell-title">{account.fullName || account.email}{account.id === user.id && ' (vy)'}</strong><span className="cell-sub">{account.email}</span></div></div></td>
      <td><span className={`status-pill ${account.role === 'sysadmin' ? 'st-accepted' : account.role === 'admin' ? 'st-interview' : 'st-submitted'}`}>{ROLES[account.role]}</span></td>
      <td>{account.id === user.id ? <span className="muted">Vlastnú rolu nemožno meniť</span> : <select aria-label={`Rola používateľa ${account.email}`} value={pending?.account.id === account.id ? pending.role : account.role} disabled={busy} onChange={(e) => { setError(''); setPending(e.target.value === account.role ? null : { account, role: e.target.value }); }}>{Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</td>
    </tr>)}</tbody></table></div>}
    <div className="results-heading"><h2>História zmien oprávnení</h2><span>Posledných 100 zmien</span></div>
    {history.length === 0 ? <p className="muted">Zatiaľ bez zmien.</p> : <div className="table-scroll"><table className="table"><thead><tr><th>Účet</th><th>Zmena roly</th><th>Zmenil</th><th>Kedy</th></tr></thead><tbody>{history.map((change) => <tr key={change.id}><td>{change.targetEmail}</td><td>{ROLES[change.previousRole]} → {ROLES[change.newRole]}</td><td>{change.actorEmail ?? 'Príkazový riadok'}</td><td>{formatDateTime(change.changedAt)}</td></tr>)}</tbody></table></div>}
  </>;
}
