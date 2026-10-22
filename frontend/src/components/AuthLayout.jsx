/** Rámec pre prihlásenie a registráciu: vľavo ako systém hodnotí CV, vpravo formulár. */
export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <section className="auth-intro">
        <span className="eyebrow">SmartRecruit</span>
        <h1>
          Životopis vyhodnotíme <em>hneď</em> po odoslaní
        </h1>
        <p>
          Každé CV porovnáme s požiadavkami pozície. Uchádzač vidí výsledok okamžite, HR manažér má všetky prihlášky
          zoradené podľa zhody.
        </p>
        <dl className="auth-facts">
          <div>
            <dt>60 %</dt>
            <dd><b>Pokrytie zručností</b>Koľko požadovaných zručností v CV nájdeme.</dd>
          </div>
          <div>
            <dt>40 %</dt>
            <dd><b>Podobnosť textu</b>Nakoľko sa slová v CV zhodujú s popisom pozície.</dd>
          </div>
          <div>
            <dt>+</dt>
            <dd><b>Prax a vzdelanie</b>Vytiahneme ich z textu, aby ich HR videl na prvý pohľad.</dd>
          </div>
        </dl>
      </section>
      <div className="auth-panel">{children}</div>
    </div>
  );
}
