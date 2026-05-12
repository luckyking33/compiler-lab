import { Binary, Boxes, ChevronRight, ScanText, Sparkles, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import DfaPage from './pages/DfaPage';
import LR0Page from './pages/LR0Page';
import ScannerPage from './pages/ScannerPage';

type RouteKey = '/scanner' | '/dfa' | '/lr0';

const routeConfig: Record<RouteKey, { label: string; icon: typeof ScanText; description: string }> = {
  '/scanner': {
    label: 'Scanner',
    icon: ScanText,
    description: 'Lexical analyzer workspace',
  },
  '/dfa': {
    label: 'DFA',
    icon: Binary,
    description: 'Deterministic finite automata simulator',
  },
  '/lr0': {
    label: 'LR(0)',
    icon: Workflow,
    description: 'Canonical collection visualizer',
  },
};

function normalizeRoute(pathname: string): RouteKey {
  if (pathname === '/lr0') {
    return '/lr0';
  }

  if (pathname === '/dfa') {
    return '/dfa';
  }

  return '/scanner';
}

function navigate(path: RouteKey) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  const [route, setRoute] = useState<RouteKey>(() => normalizeRoute(window.location.pathname));

  useEffect(() => {
    if (window.location.pathname === '/') {
      navigate('/scanner');
      return;
    }

    const syncRoute = () => setRoute(normalizeRoute(window.location.pathname));
    window.addEventListener('popstate', syncRoute);
    syncRoute();

    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  const CurrentPage = route === '/lr0' ? LR0Page : route === '/dfa' ? DfaPage : ScannerPage;

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(34,211,238,0.12),transparent_22%),radial-gradient(circle_at_85%_10%,rgba(168,85,247,0.14),transparent_26%),radial-gradient(circle_at_50%_100%,rgba(16,185,129,0.1),transparent_28%),linear-gradient(135deg,#05070d,#020617)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-4 py-4 md:px-6 md:py-5">
        <header className="glass-panel mb-4 rounded-[28px] px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-cyan-100 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Compiler Lab Studio
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Compiler Lab Studio</h1>
                <span className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-emerald-100">
                  Scanner + DFA + LR(0)
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                在一个工作台中完成词法分析、DFA 建模演示与 LR(0) 状态机可视化。
              </p>
            </div>

            <nav className="grid gap-2 sm:grid-cols-3">
              {(Object.entries(routeConfig) as Array<[RouteKey, (typeof routeConfig)[RouteKey]]>).map(([path, item]) => {
                const Icon = item.icon;
                const active = route === path;

                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => navigate(path)}
                    className={['route-pill', active ? 'route-pill-active' : 'route-pill-idle'].join(' ')}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="route-pill-icon">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block text-sm font-semibold text-white">{item.label}</span>
                      <span className="block truncate text-xs text-slate-400">{item.description}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
              <Boxes className="h-3.5 w-3.5 text-cyan-200" />
              Active route: {route}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
              API Base: <span className="font-mono text-cyan-200">{import.meta.env.VITE_API_BASE_URL || '/api'}</span>
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          <CurrentPage />
        </div>
      </div>
    </div>
  );
}
