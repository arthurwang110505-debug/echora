import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Shield, Lock, Database, Eye, Server } from 'lucide-react';
import BrandMark from '../components/BrandMark';

export default function Privacy() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#07090e] font-sans text-slate-200 selection:bg-[#62f5c4] selection:text-black">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-56 h-[32rem] w-[32rem] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute -bottom-64 -right-32 h-[34rem] w-[34rem] rounded-full bg-indigo-600/10 blur-[130px]" />
      </div>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.07] bg-[#07090e]/80 px-5 py-4 backdrop-blur-2xl sm:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-2xl border border-white/10 p-2.5 text-white transition hover:bg-white/10 active:scale-95"
            aria-label={t('privacy.back')}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
          </button>
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <span className="font-heading text-base font-extrabold tracking-tight text-white">ECHORA</span>
          </div>
        </div>
        <Link
          to="/terms"
          className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          {t('privacy.viewTerms')}
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#62f5c4]/20 bg-[#62f5c4]/10 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#62f5c4]">
            <Shield className="h-3.5 w-3.5" />
            {t('privacy.eyebrow')}
          </div>
          <h1 className="mt-4 font-heading text-3xl font-black tracking-tight text-white sm:text-4xl">{t('privacy.title')}</h1>
          <p className="mt-2 text-xs font-medium text-slate-500">{t('privacy.lastUpdated', { date: '2026-09-14' })}</p>
          <p className="mt-4 max-w-2xl text-[14px] leading-7 text-slate-300/90">{t('privacy.intro')}</p>
        </div>

        <div className="space-y-6">
          <section className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#62f5c4]/20 bg-[#62f5c4]/10 text-[#62f5c4]">
                <Lock className="h-4 w-4" />
              </span>
              <h2 className="text-base font-extrabold text-white">{t('privacy.localFirstTitle')}</h2>
            </div>
            <p className="text-[13px] leading-6 text-slate-300">{t('privacy.localFirstDesc')}</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] leading-6 text-slate-400">
              <li>{t('privacy.localFirstItem1')}</li>
              <li>{t('privacy.localFirstItem2')}</li>
              <li>{t('privacy.localFirstItem3')}</li>
            </ul>
          </section>

          <section className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300">
                <Database className="h-4 w-4" />
              </span>
              <h2 className="text-base font-extrabold text-white">{t('privacy.dataWeCollectTitle')}</h2>
            </div>
            <div className="space-y-3 text-[13px] leading-6 text-slate-300">
              <p>{t('privacy.dataWeCollectDesc')}</p>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#62f5c4]">{t('privacy.weDoNotCollect')}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
                  <li>{t('privacy.weDoNotCollect1')}</li>
                  <li>{t('privacy.weDoNotCollect2')}</li>
                  <li>{t('privacy.weDoNotCollect3')}</li>
                </ul>
              </div>
              <p className="text-slate-400">{t('privacy.localStorageDetail')}</p>
            </div>
          </section>

          <section className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#ff3d57]/20 bg-[#ff3d57]/10 text-[#ff8a99]">
                <Server className="h-4 w-4" />
              </span>
              <h2 className="text-base font-extrabold text-white">{t('privacy.thirdPartyTitle')}</h2>
            </div>
            <div className="space-y-4 text-[13px] leading-6 text-slate-300">
              <div>
                <h3 className="font-bold text-white">{t('privacy.youtubeTitle')}</h3>
                <p className="mt-1 text-slate-400">{t('privacy.youtubeDesc')}</p>
              </div>
              <div>
                <h3 className="font-bold text-white">{t('privacy.spotifyTitle')}</h3>
                <p className="mt-1 text-slate-400">{t('privacy.spotifyDesc')}</p>
              </div>
              <div>
                <h3 className="font-bold text-white">{t('privacy.lrclibTitle')}</h3>
                <p className="mt-1 text-slate-400">{t('privacy.lrclibDesc')}</p>
              </div>
              <div>
                <h3 className="font-bold text-white">{t('privacy.aiThemeTitle')}</h3>
                <p className="mt-1 text-slate-400">{t('privacy.aiThemeDesc')}</p>
              </div>
            </div>
          </section>

          <section className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300">
                <Eye className="h-4 w-4" />
              </span>
              <h2 className="text-base font-extrabold text-white">{t('privacy.cookiesTitle')}</h2>
            </div>
            <p className="text-[13px] leading-6 text-slate-400">{t('privacy.cookiesDesc')}</p>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
              <h3 className="text-sm font-extrabold text-white">{t('privacy.rightsTitle')}</h3>
              <p className="mt-2 text-[13px] leading-6 text-slate-400">{t('privacy.rightsDesc')}</p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
              <h3 className="text-sm font-extrabold text-white">{t('privacy.childrenTitle')}</h3>
              <p className="mt-2 text-[13px] leading-6 text-slate-400">{t('privacy.childrenDesc')}</p>
            </div>
          </section>

          <section className="rounded-[22px] border border-[#62f5c4]/20 bg-[#62f5c4]/[0.06] p-6 backdrop-blur-xl">
            <h3 className="text-sm font-extrabold text-white">{t('privacy.changesTitle')}</h3>
            <p className="mt-2 text-[13px] leading-6 text-slate-300">{t('privacy.changesDesc')}</p>
            <p className="mt-3 text-[13px] leading-6 text-slate-400">{t('privacy.contactDesc')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="https://github.com/arthurwang110505-debug/echora"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-black transition hover:brightness-110"
              >
                {t('privacy.openGitHub')}
              </a>
              <Link
                to="/terms"
                className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"
              >
                {t('privacy.viewTerms')}
              </Link>
            </div>
          </section>
        </div>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] pt-6 text-[11px] text-slate-500">
          <p>© {new Date().getFullYear()} Echora · AGPL-3.0</p>
          <div className="flex items-center gap-3">
            <Link to="/privacy" className="font-bold text-[#62f5c4] underline decoration-[#62f5c4]/30 underline-offset-4">
              {t('footer.privacy')}
            </Link>
            <span className="opacity-30">·</span>
            <Link to="/terms" className="font-bold text-slate-400 transition hover:text-white">
              {t('footer.terms')}
            </Link>
            <span className="opacity-30">·</span>
            <Link to="/app" className="transition hover:text-white">
              {t('footer.backToApp')}
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
