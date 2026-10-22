// Ikona a farba podľa oddelenia (neznáme oddelenie dostane predvolenú).
const DEPARTMENTS = {
  IT: { icon: '💻', color: '#4f46e5', bg: '#eef2ff' },
  Financie: { icon: '📊', color: '#0f766e', bg: '#ccfbf1' },
  HR: { icon: '🤝', color: '#be185d', bg: '#fce7f3' },
  Marketing: { icon: '📣', color: '#c2410c', bg: '#ffedd5' },
  Obchod: { icon: '💼', color: '#1d4ed8', bg: '#dbeafe' },
};
const DEFAULT = { icon: '🏢', color: '#475569', bg: '#f1f5f9' };

export const departmentStyle = (name) => DEPARTMENTS[name] ?? DEFAULT;

export default function Department({ name }) {
  const d = departmentStyle(name);
  return (
    <span className="dept" style={{ color: d.color }}>
      <span className="dept-icon" style={{ background: d.bg }}>{d.icon}</span>
      {name}
    </span>
  );
}
