// Ktorý portál beží – určuje sa pri zostavení (VITE_APP, Dockerfile build-arg APP alebo `vite --mode hr`).
//   candidate – portál uchádzača (localhost:5173)
//   hr        – HR portál (localhost:5174)

export const APP = import.meta.env.VITE_APP === 'hr' ? 'hr' : 'candidate';
export const IS_HR = APP === 'hr';

// Adresy portálov pre odkazy medzi nimi (na Azure sa nastavia pri zostavení).
export const HR_URL = (import.meta.env.VITE_HR_URL || 'http://localhost:5174').replace(/\/+$/, '');
export const CANDIDATE_URL = (import.meta.env.VITE_CANDIDATE_URL || 'http://localhost:5173').replace(/\/+$/, '');

export const STAFF_ROLES = ['admin', 'sysadmin'];
export const isStaff = (user) => STAFF_ROLES.includes(user?.role);
