import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n';
import { recordDiagnostic } from '../lib/diagnostics';
import { recoverFromStaleBuild } from '../utils/recovery';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Echora application render failed', error, info);
    recordDiagnostic('render_error', { name: error.name || 'Error' });
  }

  private recover = () => {
    void recoverFromStaleBuild();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07090e] p-6 text-slate-100">
        <section role="alert" className="w-full max-w-md rounded-3xl border border-white/15 bg-[#111720] p-7 text-center shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#62f5c4]">Echora recovery</p>
          <h1 className="mt-3 text-2xl font-black text-white">{i18n.t('appHome.errorBoundaryTitle')}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{i18n.t('appHome.errorBoundaryCopy')}</p>
          <button type="button" onClick={this.recover} className="mt-6 min-h-11 rounded-xl bg-[#62f5c4] px-5 py-3 text-sm font-extrabold text-black transition hover:brightness-110">{i18n.t('appHome.errorBoundaryReload')}</button>
        </section>
      </main>
    );
  }
}
