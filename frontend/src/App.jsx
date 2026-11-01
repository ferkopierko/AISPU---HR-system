import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireRole from './components/RequireRole';
import Login from './pages/Login';
import Register from './pages/Register';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import MyApplications from './pages/MyApplications';
import Profile from './pages/Profile';
import AdminApplications from './pages/AdminApplications';
import AdminJobs from './pages/AdminJobs';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/jobs" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Obrazovka 1 – katalóg pozícií a prihláška (verejné, prihlásenie až pri odoslaní) */}
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />

        {/* Uchádzač – vlastné prihlášky; profil pre obe roly */}
        <Route path="/my" element={<RequireRole role="user"><MyApplications /></RequireRole>} />
        <Route path="/profile" element={<RequireRole><Profile /></RequireRole>} />

        {/* Obrazovka 2 – HR dashboard a správa pozícií, iba rola admin */}
        <Route path="/admin" element={<RequireRole role="admin"><AdminApplications /></RequireRole>} />
        <Route path="/admin/jobs" element={<RequireRole role="admin"><AdminJobs /></RequireRole>} />
        <Route path="*" element={<p>Stránka neexistuje.</p>} />
      </Route>
    </Routes>
  );
}
