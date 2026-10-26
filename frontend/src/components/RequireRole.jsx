import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

/** Chráni stránku: neprihlásený -> /login, iná rola -> hláška. Skutočnú kontrolu robí backend. */
export default function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p>Načítavam…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role && user.role !== role) return <p className="error">Na túto stránku nemáte oprávnenie.</p>;
  return children;
}
