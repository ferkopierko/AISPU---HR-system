import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import Layout, { SideLink } from '../components/Layout';
import { IconBriefcase, IconExternal, IconFile, IconUser } from '../components/Icons';
import RequireRole from '../components/RequireRole';
import { HR_URL, isStaff } from '../portal';
import JobDetail from '../pages/JobDetail';
import Jobs from '../pages/Jobs';
import Login from '../pages/Login';
import MyApplications from '../pages/MyApplications';
import Profile from '../pages/Profile';
import Register from '../pages/Register';

// Portál uchádzača (localhost:5173): pozície a prihláška s CV, vlastné prihlášky, profil.

const SECTIONS = [['/my', 'Moje prihlášky'], ['/profile', 'Môj profil'], ['/jobs', 'Pracovné príležitosti']];

function nav(user) {
  return (
    <>
      <SideLink to="/jobs" icon={IconBriefcase}>Pracovné ponuky</SideLink>
      {isStaff(user) ? (
        // HR účet sem patrí len výnimočne (napr. povýšenie počas session) – pošleme ho do HR portálu
        <a href={`${HR_URL}/login`}><IconExternal />Prejsť do HR portálu</a>
      ) : (
        <SideLink to="/my" icon={IconFile}>Moje prihlášky</SideLink>
      )}
      <SideLink to="/profile" icon={IconUser}>Môj profil</SideLink>
    </>
  );
}

export default function CandidateApp() {
  return (
    <Routes>
      <Route
        element={
          <Layout
            home="/jobs" workspaceLabel="Môj pracovný priestor" nav={nav} sections={SECTIONS}
            publicNav={(text) => <NavLink to="/jobs">{text('Pozície')}</NavLink>}
          />
        }
      >
        <Route path="/" element={<Navigate to="/jobs" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* katalóg pozícií a prihláška (verejné, prihlásenie až pri odoslaní) */}
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />

        <Route path="/my" element={<RequireRole role="user"><MyApplications /></RequireRole>} />
        <Route path="/profile" element={<RequireRole><Profile /></RequireRole>} />
        <Route path="*" element={<p>Stránka neexistuje.</p>} />
      </Route>
    </Routes>
  );
}
