import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

/** Kam poslať prihláseného: späť na stránku, odkiaľ prišiel (ak ju jeho rola smie vidieť), inak domov. */
export function homePath(user, from) {
  if (user.role === 'admin') return from?.startsWith('/admin') || from === '/profile' ? from : '/admin';
  return from && !from.startsWith('/admin') ? from : '/jobs';
}

/** Chráni stránku: neprihlásený -> /login, iná rola -> hláška. Skutočnú kontrolu robí backend. */
export default function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="loading"><span className="spinner dark" /> Načítavam…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role && user.role !== role) return <p className="error">Na túto stránku nemáte oprávnenie.</p>;
  return children;
}
