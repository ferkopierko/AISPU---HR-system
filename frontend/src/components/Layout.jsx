import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import { usePreferences } from '../preferences';
import DisplayPreferences from './DisplayPreferences';
import { useAuth } from '../auth';
import { IconBriefcase, IconFile, IconInbox, IconLogOut, IconUser, IconUsers } from './Icons';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t, language } = usePreferences();
  const isAuthPage = pathname === '/login' || pathname === '/register';
  const text = (value) => isAuthPage ? t(value) : value;
  useLayoutEffect(() => { document.documentElement.lang = isAuthPage ? language : 'sk'; }, [isAuthPage, language]);
  const workspace = !!user;
  const isStaff = ['admin', 'sysadmin'].includes(user?.role);
  const roleLabel = user?.role === 'sysadmin' ? 'Správca systému' : user?.role === 'admin' ? 'HR manažér' : 'Uchádzač';
  const section = pathname.startsWith('/admin/users') ? 'Správa používateľov' : pathname.startsWith('/admin/jobs') ? 'Správa pozícií' : pathname.startsWith('/admin') ? 'Prihlášky' : pathname === '/my' ? 'Moje prihlášky' : pathname === '/profile' ? 'Môj profil' : 'Pracovné príležitosti';

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className={workspace ? 'app-shell workspace-shell' : 'app-shell public-shell'}>
      <a href="#main-content" className="skip-link">{text('Preskočiť na obsah')}</a>
      {workspace && (
        <aside className="sidebar">
          <Link to={isStaff ? '/admin' : '/jobs'} className="brand sidebar-brand">
            <span>Smart<span className="brand-accent">Recruit</span><small>Ľudia na správnom mieste.</small></span>
          </Link>
          <div className="workspace-label"><span className="workspace-dot" />{isStaff ? 'HR pracovný priestor' : 'Môj pracovný priestor'}</div>
          <nav className="side-nav" aria-label="Hlavná navigácia">
            {isStaff ? <>
              <NavLink to="/admin" end><IconUsers />Prihlášky</NavLink>
              <NavLink to="/admin/jobs"><IconBriefcase />Správa pozícií</NavLink>
              <NavLink to="/jobs"><IconInbox />Verejné ponuky</NavLink>
              {user.role === 'sysadmin' && <NavLink to="/admin/users"><IconUser />Správa používateľov</NavLink>}
            </> : <>
              <NavLink to="/jobs"><IconBriefcase />Pracovné ponuky</NavLink>
              <NavLink to="/my"><IconFile />Moje prihlášky</NavLink>
            </>}
            <NavLink to="/profile"><IconUser />Môj profil</NavLink>
          </nav>
          <div className="sidebar-bottom">SmartRecruit AI<span>AISPU {new Date().getFullYear()}</span></div>
        </aside>
      )}
      <div className="app-body">
      <header className="topbar">
        <div className="topbar-inner">
          {workspace ? <div className="breadcrumb"><span>Pracovný priestor</span><span aria-hidden="true">/</span><strong>{section}</strong></div> : <>
          <Link to="/" className="brand">
            Smart<span className="brand-accent">Recruit</span>
          </Link>
          <nav className="nav" aria-label={text('Hlavná navigácia')}>
            <NavLink to="/jobs">{text('Pozície')}</NavLink>
          </nav>
          </>}
          <div className="user">
            <DisplayPreferences languageSwitch={isAuthPage} />
            {user ? (
              <>
                <Link to="/profile" className="user-link" title="Môj profil">
                  <span className="avatar" aria-hidden="true">{initials(user.fullName || user.email)}</span>
                  <span className="user-info">
                    <span>{user.fullName || user.email}</span>
                    <span>{roleLabel}</span>
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
                <Link to="/login" className="btn btn-sm secondary">{text('Prihlásiť sa')}</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main-content" className="container" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="footer">
        <span>SmartRecruit AI</span>
        <span>{text('Tímový projekt AISPU')} {new Date().getFullYear()}</span>
      </footer>
      </div>
    </div>
  );
}

/** Iniciály z mena („Ján Novák“ -> JN) alebo z e-mailu (jan.novak@… -> JN). */
export function initials(text = '') {
  const name = text.split('@')[0].replace(/[^\p{L}]/gu, ' ').trim().split(/\s+/);
  return ((name[0]?.[0] ?? '') + (name[1]?.[0] ?? name[0]?.[1] ?? '')).toUpperCase() || '?';
}
