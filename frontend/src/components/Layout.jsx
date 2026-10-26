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
            {user?.role === 'admin' && <NavLink to="/admin">HR prehľad</NavLink>}
          </nav>
          <div className="user">
            {user ? (
              <>
                <span className="avatar" aria-hidden="true">{initials(user.email)}</span>
                <span className="user-info">
                  <span>{user.email}</span>
                  <span>{user.role === 'admin' ? 'HR manažér' : 'Uchádzač'}</span>
                </span>
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

export function initials(email = '') {
  const name = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim().split(/\s+/);
  return ((name[0]?.[0] ?? '') + (name[1]?.[0] ?? name[0]?.[1] ?? '')).toUpperCase() || '?';
}
