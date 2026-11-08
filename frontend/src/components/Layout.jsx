import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import { usePreferences } from '../preferences';
import DisplayPreferences from './DisplayPreferences';
import { useAuth } from '../auth';
import { IconLogOut } from './Icons';

/**
 * Rám stránky spoločný pre oba portály. Navigáciu dodá každá aplikácia sama (apps/CandidateApp, apps/HrApp):
 * @param {string} home          kam vedie logo
 * @param {string} [brandSuffix] doplnok názvu v hlavičke („HR“ v HR portáli)
 * @param {string} workspaceLabel nadpis bočného panela pre prihláseného
 * @param {(user) => React.ReactNode} nav  odkazy v bočnom paneli pre prihláseného
 * @param {React.ReactNode} [publicNav]    odkazy v hlavičke pre neprihláseného
 * @param {Array<[string, string]>} sections  [začiatok cesty, názov] pre drobčekovú navigáciu, prvá zhoda vyhráva
 */
export default function Layout({ home, brandSuffix, workspaceLabel, nav, publicNav, sections }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t, language } = usePreferences();
  const isAuthPage = pathname === '/login' || pathname === '/register';
  const text = (value) => isAuthPage ? t(value) : value;
  useLayoutEffect(() => { document.documentElement.lang = isAuthPage ? language : 'sk'; }, [isAuthPage, language]);
  const workspace = !!user;
  const roleLabel = user?.role === 'sysadmin' ? 'Správca systému' : user?.role === 'admin' ? 'HR manažér' : 'Uchádzač';
  const section = sections.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? sections.at(-1)[1];

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const brand = (
    <>Smart<span className="brand-accent">Recruit</span>{brandSuffix && <> {brandSuffix}</>}</>
  );

  return (
    <div className={workspace ? 'app-shell workspace-shell' : 'app-shell public-shell'}>
      <a href="#main-content" className="skip-link">{text('Preskočiť na obsah')}</a>
      {workspace && (
        <aside className="sidebar">
          <Link to={home} className="brand sidebar-brand">
            <span>{brand}<small>Ľudia na správnom mieste.</small></span>
          </Link>
          <div className="workspace-label"><span className="workspace-dot" />{workspaceLabel}</div>
          <nav className="side-nav" aria-label="Hlavná navigácia">
            {nav(user)}
          </nav>
          <div className="sidebar-bottom">SmartRecruit AI<span>AISPU {new Date().getFullYear()}</span></div>
        </aside>
      )}
      <div className="app-body">
      <header className="topbar">
        <div className="topbar-inner">
          {workspace ? <div className="breadcrumb"><span>Pracovný priestor</span><span aria-hidden="true">/</span><strong>{section}</strong></div> : <>
          <Link to={home} className="brand">{brand}</Link>
          {publicNav && <nav className="nav" aria-label={text('Hlavná navigácia')}>{publicNav(text)}</nav>}
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
              <Link to="/login" className="btn btn-sm secondary">{text('Prihlásiť sa')}</Link>
            )}
          </div>
        </div>
      </header>
      <main id="main-content" className="container" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="footer">
        <span>SmartRecruit AI{brandSuffix && ` ${brandSuffix}`}</span>
        <span>{text('Tímový projekt AISPU')} {new Date().getFullYear()}</span>
      </footer>
      </div>
    </div>
  );
}

/** Odkaz v bočnom paneli (rovnaký vzhľad v oboch portáloch). */
export function SideLink({ to, icon: Icon, end, children }) {
  return <NavLink to={to} end={end}><Icon />{children}</NavLink>;
}

/** Iniciály z mena („Ján Novák“ -> JN) alebo z e-mailu (jan.novak@… -> JN). */
export function initials(text = '') {
  const name = text.split('@')[0].replace(/[^\p{L}]/gu, ' ').trim().split(/\s+/);
  return ((name[0]?.[0] ?? '') + (name[1]?.[0] ?? name[0]?.[1] ?? '')).toUpperCase() || '?';
}
