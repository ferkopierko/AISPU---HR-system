import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { IconLogOut } from './Icons';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            Smart<span>Recruit</span>
          </Link>
          <nav className="nav" aria-label="Hlavná navigácia">
            <NavLink to="/jobs">Pozície</NavLink>
            {user?.role === 'user' && <NavLink to="/my">Moje prihlášky</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin" end>Prihlášky</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin/jobs">Správa pozícií</NavLink>}
          </nav>
          <div className="user">
            {user ? (
              <>
                <Link to="/profile" className="user-link" title="Môj profil">
                  <span className="avatar" aria-hidden="true">{initials(user.fullName || user.email)}</span>
                  <span className="user-info">
                    <span>{user.fullName || user.email}</span>
                    <span>{user.role === 'admin' ? 'HR manažér' : 'Uchádzač'} · profil</span>
                  </span>
                  <span className="visually-hidden">Môj profil</span>
                </Link>
                <button className="ghost" onClick={handleLogout} title="Odhlásiť sa">
                  <IconLogOut size={16} />
                  <span className="visually-hidden">Odhlásiť sa</span>
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-sm secondary">Prihlásiť sa</Link>
                <Link to="/register" className="btn btn-sm">Registrácia</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
      <footer className="footer">
        <span>SmartRecruit · tímový projekt AISPU</span>
        <span className="num">{new Date().getFullYear()}</span>
      </footer>
    </>
  );
}

/** Iniciály z mena („Ján Novák“ -> JN) alebo z e-mailu (jan.novak@… -> JN). */
export function initials(text = '') {
  const name = text.split('@')[0].replace(/[^\p{L}]/gu, ' ').trim().split(/\s+/);
  return ((name[0]?.[0] ?? '') + (name[1]?.[0] ?? name[0]?.[1] ?? '')).toUpperCase() || '?';
}
