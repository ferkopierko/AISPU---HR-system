import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireRole from './components/RequireRole';
import Login from './pages/Login';
import Register from './pages/Register';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import AdminApplications from './pages/AdminApplications';

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

        {/* Obrazovka 2 – HR dashboard, iba rola admin */}
        <Route
          path="/admin"
          element={
            <RequireRole role="admin">
              <AdminApplications />
            </RequireRole>
          }
        />
        <Route path="*" element={<p>Stránka neexistuje.</p>} />
      </Route>
    </Routes>
  );
}
