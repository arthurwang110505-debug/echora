/**
 * Test-only setup. The application loads locale bundles per route; a unit test can mount any
 * surface from any entry point, so here every bundle is merged into the shared instance up front —
 * which is exactly the pre-split behaviour the assertions were written against.
 *
 * The production split is not left to this file's reputation: `localeBundles.test.ts` proves the
 * shell can render every key it references, and each route can render its own, straight from the
 * import graph.
 */
import i18n from './index';
import type { AppLanguage } from './index';

const modules = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*.json', { eager: true });

for (const [path, module] of Object.entries(modules)) {
  const language: AppLanguage | null = path.endsWith('.en.json') ? 'en' : path.endsWith('.zh-TW.json') ? 'zh-TW' : null;
  if (!language) continue;
  i18n.addResourceBundle(language, 'translation', module.default, true, true);
}
