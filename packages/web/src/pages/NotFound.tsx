// src/pages/NotFound.tsx
//
// A 404 that says "not found".
//
// Before this, an unknown path fell to the router's error boundary, which is written for the case
// where a *code split chunk* failed to load: it offers "clear the cache and reload" and "page load
// failed". Both are wrong for a mistyped URL, and the advice makes the user do work to fix a
// problem the app created. This page is the correct answer to the question the user actually has.

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Home } from 'lucide-react';

const NotFound: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#07090e] p-6 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-white/15 bg-[#111720] p-7 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#62f5c4]">404</p>
        <h1 className="mt-3 text-2xl font-black text-white">{t('notFound.title')}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{t('notFound.copy')}</p>
        {/* The path itself is the one piece of information that helps: it is usually a typo the
            user can see. Shown in a monospace block so a trailing slash or a capital is visible. */}
        <p className="mt-3 break-all rounded-xl bg-black/40 px-3 py-2 font-mono text-[12px] text-slate-400">
          {pathname}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('notFound.goBack')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#62f5c4] px-5 py-3 text-sm font-extrabold text-black transition hover:brightness-110"
          >
            <Home aria-hidden="true" className="h-4 w-4" />
            {t('notFound.goHome')}
          </button>
        </div>
      </section>
    </main>
  );
};

export default NotFound;
