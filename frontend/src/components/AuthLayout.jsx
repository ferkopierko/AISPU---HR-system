/** Rámec pre prihlásenie a registráciu: vľavo ako systém hodnotí CV, vpravo formulár. */
export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <section className="auth-intro">
        <span className="eyebrow">SmartRecruit</span>
        <h1>
          Životopis prepojíme s <em>požiadavkami</em> pozície
        </h1>
        <p>
          Prihláška sa uloží hneď. Analýza prebehne na pozadí a ukáže textové podklady,
          ktoré HR pracovník využije pri vlastnom posúdení.
        </p>
        <dl className="auth-facts">
          <div>
            <dt>01</dt>
            <dd><b>Vážené požiadavky</b>Skóre vyjadruje podiel doložených zručností podľa ich dôležitosti.</dd>
          </div>
          <div>
            <dt>02</dt>
            <dd><b>Textové podklady</b>Pri náleze sa dá skontrolovať pasáž životopisu a istota extrakcie.</dd>
          </div>
          <div>
            <dt>HR</dt>
            <dd><b>Osobné posúdenie</b>Skóre pomáha čítať CV. O ďalšom postupe vždy rozhoduje človek.</dd>
          </div>
        </dl>
      </section>
      <div className="auth-panel">{children}</div>
    </div>
  );
}
