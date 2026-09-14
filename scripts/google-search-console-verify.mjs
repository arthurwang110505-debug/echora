#!/usr/bin/env node
/**
 * Helper for the two Search Console verification methods that can work on a
 * Vercel static deployment (see docs/google-oauth-brand-verification.md).
 *
 *   node scripts/google-search-console-verify.mjs meta <token-or-meta-tag>
 *   node scripts/google-search-console-verify.mjs file google<token>.html
 *   node scripts/google-search-console-verify.mjs file google<token>.html --remove
 *
 * Both forms are additive: nothing is written until you run the command, and the
 * `meta` form never touches the repository (the tag is injected at build time by
 * `packages/web/vite-plugins/siteMetadata.ts`).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = resolve(REPO_ROOT, 'packages/web/public');
const FILE_PATTERN = /^google[0-9a-z_-]+\.html$/i;

const usage = () => {
  console.log(`用法：
  node scripts/google-search-console-verify.mjs meta <驗證內容或整段 meta 標籤>
      使用 Search Console 的「HTML 標記」方法。腳本不會改動 repo，只會印出
      需要設定的環境變數，meta 標籤由 Vite 在建置時注入 index.html。

  node scripts/google-search-console-verify.mjs file google<token>.html
      使用「HTML 檔案」方法。會把驗證檔寫進 packages/web/public/，
      部署後 https://<domain>/google<token>.html 會直接回傳驗證內容。

範例：
  node scripts/google-search-console-verify.mjs meta AbC-dEf123
  node scripts/google-search-console-verify.mjs file google1a2b3c4d5e6f.html`);
};

const isMetaTag = (value) => /google-site-verification/i.test(value);

const runMeta = (rawValue) => {
  if (!rawValue) {
    console.error('錯誤：請提供 Search Console 的驗證內容（content 的值）或整段 <meta> 標籤。');
    process.exitCode = 1;
    return;
  }
  const content = isMetaTag(rawValue) ? rawValue.match(/content=["']([^"']+)["']/i)?.[1] : rawValue;
  if (!content) {
    console.error('錯誤：無法從提供的字串取得 content 值。');
    process.exitCode = 1;
    return;
  }

  console.log(`驗證內容：${content}\n`);
  console.log('1. Vercel → 你的專案 → Settings → Environment Variables 新增：');
  console.log(`     VITE_GOOGLE_SITE_VERIFICATION = ${content}`);
  console.log('   （Production 與 Preview 都勾選；也可以只放 Production。）\n');
  console.log('2. 本機想先確認時，寫進 packages/web/.env.local（此檔已被 .gitignore 忽略）：');
  console.log(`     VITE_GOOGLE_SITE_VERIFICATION=${content}\n`);
  console.log('3. 重新部署（Redeploy）後，首頁原始碼應該包含：');
  console.log(`     <meta name="google-site-verification" content="${content}" />\n`);
  console.log('4. 回 Search Console 按「驗證」。');
  console.log('   驗證通過後可以保留這個變數 —— 重新驗證會再用到它。');
};

const runFile = (fileName, remove) => {
  if (!fileName || !FILE_PATTERN.test(fileName)) {
    console.error('錯誤：檔名需符合 google<token>.html（Search Console 下載的檔名）。');
    process.exitCode = 1;
    return;
  }
  const target = resolve(PUBLIC_DIR, fileName);
  if (remove) {
    rmSync(target, { force: true });
    console.log(`已刪除 ${target}`);
    return;
  }
  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(target, `google-site-verification: ${fileName}\n`, 'utf8');
  console.log(`已建立 ${target}`);
  console.log('\n部署後 https://<你的網域>/' + fileName + ' 應回傳：');
  console.log(`  google-site-verification: ${fileName}\n`);
  console.log('接著：');
  console.log(`  git add packages/web/public/${fileName}`);
  console.log(`  git commit -m "chore: add Google Search Console verification file"`);
  console.log('  git push   # Vercel 會自動部署，完成後回 Search Console 按「驗證」');
  console.log('\n注意：不要刪掉這個檔案，Search Console 之後會重新檢查它。');
};

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'meta':
    runMeta(rest.join(' ').trim());
    break;
  case 'file':
    runFile(rest.find((argument) => !argument.startsWith('-')), rest.includes('--remove'));
    break;
  default:
    usage();
    if (command && command !== 'help' && command !== '--help' && command !== '-h') {
      console.error(`\n未知的指令：${command}`);
      process.exitCode = 1;
    }
}
