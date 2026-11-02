import { IconBriefcase, IconBuilding, IconChart, IconCode, IconMegaphone, IconUsers } from './Icons';

// Ikona podľa oddelenia (neznáme oddelenie dostane budovu).
const ICONS = {
  IT: IconCode,
  Financie: IconChart,
  HR: IconUsers,
  Marketing: IconMegaphone,
  Obchod: IconBriefcase,
};

export default function Department({ name }) {
  const Icon = ICONS[name] ?? IconBuilding;
  return (
    <span className="dept">
      <Icon size={14} />
      {name}
    </span>
  );
}
