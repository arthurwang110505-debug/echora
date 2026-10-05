import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { LocaleBundleName } from './bundles';
import shellZhTW from './locales/shell.zh-TW.json';
import shellEn from './locales/shell.en.json';

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

// i18next's deep `addResourceBundle` extends whatever object the resource store holds *in place*,
// and `init` holds the imported shell module — so the store gets its own copy, and the imported
// resources stay immutable for anyone else holding a reference (tests, the bundle guard).
const cloneResources = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

void i18n.use(initReactI18next).init({
  resources: {
    'zh-TW': { translation: cloneResources(shellZhTW) },
    en: { translation: cloneResources(shellEn) },
  },
  lng: readStoredLanguage(),
  fallbackLng: 'zh-TW',
  // Only the shell resources are bundled inline (no async backend), so init is synchronous and
  // `t()` works immediately for the app chrome — including in renderToStaticMarkup-based tests.
  // Everything a page owns arrives with that page: see `loadLocaleBundle` below.
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const getLanguage = (): AppLanguage => (i18n.language?.startsWith('en') ? 'en' : 'zh-TW');

// `import.meta.glob` keeps the loader honest: adding `locales/<bundle>.<lang>.json` is enough for it
// to be fetchable, and Vite emits one chunk per file instead of us hand-wiring ten import paths.
// The shell files are statically imported above and excluded here, so they are not emitted twice.
const localeBundleModules = import.meta.glob<{ default: Record<string, unknown> }>([
  './locales/*.json',
  '!./locales/shell.*.json',
]);

const loadedBundles = new Set<LocaleBundleName>();
const loadedByLanguage = new Map<AppLanguage, Set<LocaleBundleName>>();

const bundlePath = (bundle: LocaleBundleName, language: AppLanguage) => `./locales/${bundle}.${language}.json`;

const loadBundleForLanguage = async (bundle: LocaleBundleName, language: AppLanguage): Promise<void> => {
  const loaded = loadedByLanguage.get(language) ?? new Set<LocaleBundleName>();
  loadedByLanguage.set(language, loaded);
  if (loaded.has(bundle)) return;
  const load = localeBundleModules[bundlePath(bundle, language)];
  if (!load) {
    console.error(`[i18n] missing locale bundle ${bundlePath(bundle, language)}`);
    return;
  }
  const module = await load();
  // Deep merge: the shell already carries the handful of strings the app chrome renders from
  // sections that otherwise live in a bundle (the mini player, the error boundary, the OBS
  // overlay), and the bundle is the complete section.
  i18n.addResourceBundle(language, 'translation', module.default, true, true);
  loaded.add(bundle);
};

/**
 * Loads one bundle in the active language. Only the language being read is fetched; a switch
 * re-reads the bundles already in play (`setLanguage`), so the other language's copy is never
 * downloaded for someone who does not switch.
 */
export const loadLocaleBundle = async (bundle: LocaleBundleName): Promise<void> => {
  loadedBundles.add(bundle);
  await loadBundleForLanguage(bundle, getLanguage());
};

/**
 * Wraps a lazy route importer so the route's copy is in place before the route first renders.
 * The page chunk and the locale chunk are fetched in parallel; rendering only starts once both
 * have landed, which is what keeps `t()` from returning raw keys for a frame.
 */
export const withLocaleBundle = <T,>(
  bundle: LocaleBundleName,
  importer: () => Promise<T>,
): (() => Promise<T>) => async () => {
  const [module] = await Promise.all([importer(), loadLocaleBundle(bundle)]);
  return module;
};

export const setLanguage = (language: AppLanguage): void => {
  void (async () => {
    // The active route's bundles must exist in the target language before the switch, or the
    // page would render raw keys between `changeLanguage` and the fetch resolving.
    await Promise.all([...loadedBundles].map((bundle) => loadBundleForLanguage(bundle, language)));
    await i18n.changeLanguage(language);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      } catch {
        // Storage can be unavailable (private mode); language still switches for the session.
      }
    }
  })();
};

export default i18n;
