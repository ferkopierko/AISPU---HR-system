import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePreferences } from '../preferences';

/** Both forms share a stable top edge; switching forms starts at the same point. */
export default function AuthLayout({ children }) {
  const { pathname } = useLocation();
  const { t, language } = usePreferences();
  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return (
    <div className="auth" lang={language}>
      <section className="auth-intro">
        <div className="auth-intro-copy">
          <h1>{t('Vaša ďalšia príležitosť začína tu.')}</h1>
          <p>{t('Nájdite si svoje miesto so SmartRecruit.')}</p>
        </div>
      </section>
      <div className="auth-form-column"><div className="auth-panel">{children}</div></div>
    </div>
  );
}
