import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { CANDIDATE_URL, HR_URL, IS_HR, isStaff } from '../portal';

/** Kam poslať prihláseného: späť na stránku, odkiaľ prišiel, inak na úvod portálu. */
export function homePath(user, from) {
  const back = from && from !== '/login' && from !== '/register' ? from : null;
  if (IS_HR) return back ?? '/applications';
  return back ?? '/jobs';
}

/** Účet nepatrí do tohto portálu – odkaz na ten správny. */
export function WrongPortal({ user }) {
  if (IS_HR || !isStaff(user)) {
    return (
      <div className="error" role="alert">
        <span>
          Tento účet nemá prístup do HR portálu.{' '}
          <a href={CANDIDATE_URL}>Prejsť do portálu uchádzača</a>
        </span>
      </div>
    );
  }
  return (
    <div className="error" role="alert">
      <span>
        HR účty pracujú v HR portáli. <a href={`${HR_URL}/login`}>Prejsť do HR portálu</a>
      </span>
    </div>
  );
}

/**
 * Chráni stránku: neprihlásený -> /login, iná rola -> hláška. Skutočnú kontrolu robí backend.
 * role 'admin' pustí aj sysadmina; role 'user' iba uchádzača.
 */
export default function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="loading"><span className="spinner dark" /> Načítavam…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  // do HR portálu patria iba HR účty, do portálu uchádzača iba uchádzači
  if (IS_HR !== isStaff(user)) return <WrongPortal user={user} />;
  if (role && user.role !== role && !(role === 'admin' && user.role === 'sysadmin')) return <p className="error">Na túto stránku nemáte oprávnenie.</p>;
  return children;
}
