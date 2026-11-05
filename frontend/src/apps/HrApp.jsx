import { Navigate, Route, Routes } from 'react-router-dom';
import Layout, { SideLink } from '../components/Layout';
import { IconBriefcase, IconExternal, IconUser, IconUsers } from '../components/Icons';
import RequireRole from '../components/RequireRole';
import { CANDIDATE_URL } from '../portal';
import AdminApplications from '../pages/AdminApplications';
import AdminJobs from '../pages/AdminJobs';
import Login from '../pages/Login';
import Profile from '../pages/Profile';
import SystemUsers from '../pages/SystemUsers';

// HR portál (localhost:5174): prihlášky, správa pozícií, správa používateľov (sysadmin), profil.
// Registrácia tu nie je – HR účty zakladá správca systému.

const SECTIONS = [['/jobs', 'Správa pozícií'], ['/users', 'Správa používateľov'], ['/profile', 'Môj profil'], ['/applications', 'Prihlášky']];

function nav(user) {
  return (
    <>
      <SideLink to="/applications" icon={IconUsers}>Prihlášky</SideLink>
      <SideLink to="/jobs" icon={IconBriefcase}>Správa pozícií</SideLink>
      {/* ako pozície vidí uchádzač – v portáli uchádzača, v novej karte */}
      <a href={`${CANDIDATE_URL}/jobs`} target="_blank" rel="noopener noreferrer"><IconExternal />Verejné ponuky</a>
      {user.role === 'sysadmin' && <SideLink to="/users" icon={IconUser}>Správa používateľov</SideLink>}
      <SideLink to="/profile" icon={IconUser}>Môj profil</SideLink>
    </>
  );
}

export default function HrApp() {
  return (
    <Routes>
      <Route element={<Layout home="/applications" brandSuffix="HR" workspaceLabel="HR pracovný priestor" nav={nav} sections={SECTIONS} />}>
        <Route path="/" element={<Navigate to="/applications" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />

        <Route path="/applications" element={<RequireRole role="admin"><AdminApplications /></RequireRole>} />
        <Route path="/jobs" element={<RequireRole role="admin"><AdminJobs /></RequireRole>} />
        <Route path="/users" element={<RequireRole role="sysadmin"><SystemUsers /></RequireRole>} />
        <Route path="/profile" element={<RequireRole><Profile /></RequireRole>} />
        <Route path="*" element={<p>Stránka neexistuje.</p>} />
      </Route>
    </Routes>
  );
}
