import { createContext, useContext, useLayoutEffect, useState } from 'react';

const EN = {
  'Vaša ďalšia príležitosť začína tu.': 'Your next opportunity starts here.',
  'Nájdite si svoje miesto so SmartRecruit.': 'Find your place with SmartRecruit.',
  'Prihlásenie': 'Sign in',
  'Vitajte späť. Prihláste sa do svojho účtu.': 'Welcome back. Sign in to your account.',
  'E-mail': 'Email', 'Heslo': 'Password', 'Prihlasujem…': 'Signing in…', 'Prihlásiť sa': 'Sign in',
  'Ešte nemáte účet?': 'New here?', 'Zaregistrujte sa': 'Create an account',
  'Vytvorte si účet': 'Create your account',
  'Majte svoje pracovné príležitosti poruke.': 'Keep your career opportunities close.',
  'Meno a priezvisko': 'Full name', 'Telefón': 'Phone', 'nepovinné': 'optional',
  'Na kontaktovanie ohľadom vašej prihlášky.': 'For updates about your application.',
  'Aspoň 8 znakov.': 'At least 8 characters.', 'Heslo znova': 'Confirm password',
  'Vytváram účet…': 'Creating account…', 'Vytvoriť účet': 'Create account',
  'Už máte účet?': 'Already have an account?', 'Prihláste sa': 'Sign in',
  'Heslá sa nezhodujú': 'Passwords do not match',
  'Nesprávny email alebo heslo': 'Incorrect email or password',
  'Účet s týmto emailom už existuje': 'An account with this email already exists',
  'Email je povinný': 'Email is required', 'Neplatný email': 'Enter a valid email address',
  'Heslo musí mať aspoň 8 znakov': 'Password must contain at least 8 characters',
  'Heslo je príliš dlhé (max. 72 bajtov)': 'Password is too long (maximum 72 bytes)',
  'Meno je povinné': 'Full name is required', 'Meno môže mať najviac 200 znakov': 'Full name must not exceed 200 characters',
  'Telefón musí byť text': 'Enter a valid phone number', 'Neplatné telefónne číslo': 'Enter a valid phone number',
  'Pozície': 'Jobs', 'Preskočiť na obsah': 'Skip to content', 'Hlavná navigácia': 'Main navigation',
  'Tímový projekt AISPU': 'AISPU team project', 'Nastavenia zobrazenia': 'Display preferences',
  'Jazyk': 'Language', 'Zapnúť tmavý režim': 'Switch to dark mode', 'Zapnúť svetlý režim': 'Switch to light mode',
  'Nepodarilo sa pripojiť. Skúste to znova.': 'Could not connect. Please try again.',
};
const PreferencesContext = createContext(null);
function stored(key) { try { return localStorage.getItem(key); } catch { return null; } }
function save(key, value) { try { localStorage.setItem(key, value); } catch { /* Private or restricted storage: preferences still work in memory. */ } }
export function PreferencesProvider({ children }) {
  const [language, updateLanguage] = useState(() => stored('smartrecruit.language') === 'en' ? 'en' : 'sk');
  const [theme, updateTheme] = useState(() => {
    const value = stored('smartrecruit.theme');
    return ['light', 'dark'].includes(value) ? value : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const value = {
    language, theme,
    setLanguage: (next) => { updateLanguage(next); save('smartrecruit.language', next); },
    toggleTheme: () => updateTheme((previous) => { const next = previous === 'dark' ? 'light' : 'dark'; save('smartrecruit.theme', next); return next; }),
    t: (text) => language === 'en' ? EN[text] ?? text : text,
  };
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
export const usePreferences = () => useContext(PreferencesContext);
