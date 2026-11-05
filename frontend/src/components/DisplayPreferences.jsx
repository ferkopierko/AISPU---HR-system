import { usePreferences } from '../preferences';

export default function DisplayPreferences({ languageSwitch = true }) {
  const { language, setLanguage, theme, toggleTheme, t } = usePreferences();
  return <div className="display-preferences" role="group" aria-label={t('Nastavenia zobrazenia')}>
    {languageSwitch && <div className="language-switch" role="group" aria-label={t('Jazyk')}>
      <button type="button" lang="sk" aria-label="Slovenčina" aria-pressed={language === 'sk'} onClick={() => setLanguage('sk')}>SK</button>
      <button type="button" lang="en" aria-label="English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
    </div>}
    <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={t(theme === 'dark' ? 'Zapnúť svetlý režim' : 'Zapnúť tmavý režim')} title={t(theme === 'dark' ? 'Zapnúť svetlý režim' : 'Zapnúť tmavý režim')}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        {theme === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></> : <path d="M20.8 13A8.5 8.5 0 0 1 11 3.2 8.5 8.5 0 1 0 20.8 13Z" />}
      </svg>
    </button>
  </div>;
}
