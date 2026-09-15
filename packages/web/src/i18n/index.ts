import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhTW from './locales/zh-TW.json';
import en from './locales/en.json';

export const LANGUAGE_STORAGE_KEY = 'echora.lang';
export type AppLanguage = 'zh-TW' | 'en';

const readStoredLanguage = (): AppLanguage => {
  if (typeof window === 'undefined') return 'zh-TW';
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'zh-TW';
  } catch {
    return 'zh-TW';
  }
};

void i18n.use(initReactI18next).init({
  resources: {
    'zh-TW': { translation: zhTW },
    en: { translation: en },
  },
  lng: readStoredLanguage(),
  fallbackLng: 'zh-TW',
  // Resources are bundled inline (no async backend), so init is synchronous and
  // `t()` works immediately — including in renderToStaticMarkup-based tests.
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const getLanguage = (): AppLanguage => (i18n.language?.startsWith('en') ? 'en' : 'zh-TW');

export const setLanguage = (language: AppLanguage): void => {
  void i18n.changeLanguage(language);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Storage can be unavailable (private mode); language still switches for the session.
    }
  }
};

export default i18n;
