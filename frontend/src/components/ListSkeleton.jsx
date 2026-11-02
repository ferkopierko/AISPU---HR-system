/** Zástupné riadky zoznamu, kým sa načítajú dáta. */
export default function ListSkeleton({ rows = 3 }) {
  return (
    <ul className="row-list" aria-busy="true" aria-label="Načítavam">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="skeleton-row">
          <span className="skeleton" style={{ width: '40%', height: 20 }} />
          <span className="skeleton" style={{ width: '25%', height: 12 }} />
        </li>
      ))}
    </ul>
  );
}
