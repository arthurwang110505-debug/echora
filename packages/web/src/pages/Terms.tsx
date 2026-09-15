import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, Scale, Music, AlertTriangle, RefreshCw, FileMusic, ExternalLink } from 'lucide-react';
import BrandMark from '../components/BrandMark';

export default function Terms() {
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
            aria-label={t('terms.back')}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
          </button>
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <span className="font-heading text-base font-extrabold tracking-tight text-white">ECHORA</span>
          </div>
        </div>
        <Link
          to="/privacy"
          className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          {t('terms.viewPrivacy')}
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F9F871]/20 bg-[#F9F871]/10 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F9F871]">
            <Scale className="h-3.5 w-3.5" />
            {t('terms.eyebrow')}
          </div>
          <h1 className="mt-4 font-heading text-3xl font-black tracking-tight text-white sm:text-4xl">{t('terms.title')}</h1>
          <p className="mt-2 text-xs font-medium text-slate-500">{t('terms.lastUpdated', { date: '2026-09-14' })}</p>
          <p className="mt-4 max-w-2xl text-[14px] leading-7 text-slate-300/90">{t('terms.intro')}</p>
        </div>

        <div className="space-y-6">
          <section className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300">
                <FileText className="h-4 w-4" />
              </span>
              <h2 className="text-base font-extrabold text-white">{t('terms.acceptanceTitle')}</h2>
            </div>
            <p className="text-[13px] leading-6 text-slate-300">{t('terms.acceptanceDesc')}</p>
          </section>

          <section className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#62f5c4]/20 bg-[#62f5c4]/10 text-[#62f5c4]">
                <Music className="h-4 w-4" />
              </span>
              <h2 className="text-base font-extrabold text-white">{t('terms.serviceTitle')}</h2>
            </div>
            <p className="text-[13px] leading-6 text-slate-300">{t('terms.serviceDesc')}</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] leading-6 text-slate-400">
              <li>{t('terms.serviceItem1')}</li>
              <li>{t('terms.serviceItem2')}</li>
              <li>{t('terms.serviceItem3')}</li>
              <li>{t('terms.serviceItem4')}</li>
            </ul>
          </section>

          <section className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-7">
            <h2 className="text-base font-extrabold text-white">{t('terms.userResponsibilityTitle')}</h2>
            <div className="mt-3 space-y-3 text-[13px] leading-6 text-slate-400">
              <p>{t('terms.userResponsibilityDesc')}</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>{t('terms.userItem1')}</li>
                <li>{t('terms.userItem2')}</li>
                <li>{t('terms.userItem3')}</li>
                <li>{t('terms.userItem4')}</li>
              </ul>
            </div>
          </section>

          <section className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-7">
            <h2 className="text-base font-extrabold text-white">{t('terms.ipTitle')}</h2>
            <p className="mt-2 text-[13px] leading-6 text-slate-400">{t('terms.ipDesc')}</p>
            <div className="mt-3 rounded-xl border border-[#62f5c4]/20 bg-[#62f5c4]/10 p-4 text-[12px] leading-5 text-[#b8ffe2]">
              {t('terms.agplNotice')}
            </div>
          </section>

          <section className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-7">
            <h2 className="text-base font-extrabold text-white">{t('terms.thirdPartyTitle')}</h2>
            <p className="mt-2 text-[13px] leading-6 text-slate-400">{t('terms.thirdPartyDesc')}</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] leading-6 text-slate-400">
              <li>{t('terms.thirdPartyItem1')}</li>
              <li>{t('terms.thirdPartyItem2')}</li>
              <li>{t('terms.thirdPartyItem3')}</li>
            </ul>
          </section>

          {/*
            YouTube API Services terms require a conspicuous link to YouTube's
            own terms and to Google's privacy policy, plus a documented way to
            revoke access. Reviewers of the OAuth verification look for both.
          */}
          <section className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300">
                <FileMusic className="h-4 w-4" />
              </span>
              <h2 className="text-base font-extrabold text-white">{t('terms.youtubeApiTitle')}</h2>
            </div>
            <p className="text-[13px] leading-6 text-slate-400">{t('terms.youtubeApiDesc')}</p>
            <p className="mt-3 text-[13px] leading-6 text-slate-400">{t('terms.youtubeApiRevoke')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { href: 'https://developers.google.com/youtube/terms/api-services-terms-of-service', label: t('terms.youtubeApiTermsLink') },
                { href: 'https://www.youtube.com/t/terms', label: t('terms.youtubeTermsLink') },
                { href: 'https://policies.google.com/privacy', label: t('terms.googlePrivacyLink') },
                { href: 'https://myaccount.google.com/permissions', label: t('terms.googlePermissionsLink') },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  {link.label}
                </a>
              ))}
            </div>
          </section>

          <section className="rounded-[22px] border border-amber-300/20 bg-amber-300/[0.06] p-6 backdrop-blur-xl sm:p-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <h2 className="text-base font-extrabold text-white">{t('terms.disclaimerTitle')}</h2>
            </div>
            <div className="space-y-2 text-[13px] leading-6 text-slate-300">
              <p>{t('terms.disclaimerDesc')}</p>
              <p className="text-slate-400">{t('terms.limitationDesc')}</p>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
              <div className="mb-2 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-extrabold text-white">{t('terms.terminationTitle')}</h3>
              </div>
              <p className="text-[13px] leading-6 text-slate-400">{t('terms.terminationDesc')}</p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
              <h3 className="text-sm font-extrabold text-white">{t('terms.governingTitle')}</h3>
              <p className="mt-2 text-[13px] leading-6 text-slate-400">{t('terms.governingDesc')}</p>
            </div>
          </section>

          <section className="rounded-[22px] border border-[#62f5c4]/20 bg-[#62f5c4]/[0.06] p-6 backdrop-blur-xl">
            <h3 className="text-sm font-extrabold text-white">{t('terms.changesTitle')}</h3>
            <p className="mt-2 text-[13px] leading-6 text-slate-300">{t('terms.changesDesc')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/privacy"
                className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"
              >
                {t('terms.viewPrivacy')}
              </Link>
              <Link
                to="/app"
                className="rounded-xl bg-[#62f5c4] px-4 py-2.5 text-xs font-extrabold text-black transition hover:brightness-110"
              >
                {t('footer.backToApp')}
              </Link>
            </div>
          </section>
        </div>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] pt-6 text-[11px] text-slate-500">
          <p>© {new Date().getFullYear()} Echora · AGPL-3.0</p>
          <div className="flex items-center gap-3">
            <Link to="/privacy" className="font-bold text-slate-400 transition hover:text-white">
              {t('footer.privacy')}
            </Link>
            <span className="opacity-30">·</span>
            <Link to="/terms" className="font-bold text-[#F9F871] underline decoration-[#F9F871]/30 underline-offset-4">
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
