// Slovenské popisky hodnôt z API a formátovanie platu a dátumov.

export const STATUS_LABELS = {
  submitted: 'Nová',
  reviewing: 'Posudzuje sa',
  interview: 'Pohovor',
  accepted: 'Prijatý',
  rejected: 'Zamietnutý',
  withdrawn: 'Stiahnutá',
};

export const JOB_STATUS_LABELS = { draft: 'Koncept', open: 'Otvorená', closed: 'Uzavretá' };
export const EMPLOYMENT_LABELS = { full_time: 'Plný úväzok', part_time: 'Skrátený úväzok', contract: 'Dohoda', internship: 'Stáž' };
export const WORK_MODE_LABELS = { onsite: 'Na pracovisku', hybrid: 'Hybridne', remote: 'Na diaľku' };
export const SALARY_PERIOD_LABELS = { month: 'mesačne', year: 'ročne', hour: 'na hodinu' };

const money = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 0 });

/** „1 800 – 2 400 € mesačne“, „od 1 800 €…“, „do 2 400 €…“ alebo null. */
export function formatSalary({ salaryMin, salaryMax, salaryPeriod }) {
  if (salaryMin == null && salaryMax == null) return null;
  const period = SALARY_PERIOD_LABELS[salaryPeriod ?? 'month'];
  if (salaryMin != null && salaryMax != null && salaryMin !== salaryMax) {
    return `${money.format(salaryMin)} – ${money.format(salaryMax)} € ${period}`;
  }
  if (salaryMin != null && salaryMax != null) return `${money.format(salaryMin)} € ${period}`;
  return salaryMin != null ? `od ${money.format(salaryMin)} € ${period}` : `do ${money.format(salaryMax)} € ${period}`;
}

/** Dátum a čas z API (ISO) -> „27. 10. 2026“. */
export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('sk-SK') : null);
export const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

/** Uzávierka 'RRRR-MM-DD' (bez časového pásma) -> „15. 11. 2026“. */
export function formatDay(day) {
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
}

/** Počet dní do uzávierky (0 = dnes je posledný deň, záporné = po uzávierke), null bez uzávierky. */
export function daysLeft(day) {
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - start) / 86_400_000);
}

/** „dnes je posledný deň“, „ešte 3 dni“ – iba ak uzávierka je do týždňa. */
export function deadlineHint(day) {
  const left = daysLeft(day);
  if (left == null || left < 0 || left > 7) return null;
  if (left === 0) return 'dnes je posledný deň';
  if (left === 1) return 'zajtra je posledný deň';
  return `ešte ${left} ${left < 5 ? 'dni' : 'dní'}`;
}
