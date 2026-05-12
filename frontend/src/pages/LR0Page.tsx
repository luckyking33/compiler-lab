import { ReactFlowProvider } from '@xyflow/react';
import { AlertTriangle, Braces, GitBranch, Loader2, Play, RefreshCcw, ShieldAlert, Workflow } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchLR0Automaton, generateLR0Automaton } from '../api';
import LR0Visualizer, { type LR0AutomatonData } from '../components/LR0Visualizer';

const defaultGrammar = `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`;

export default function LR0Page() {
  const [grammar, setGrammar] = useState(defaultGrammar);
  const [automaton, setAutomaton] = useState<LR0AutomatonData>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState('');
  const [sourceLabel, setSourceLabel] = useState('示例 JSON');

  const stats = useMemo(() => {
    const nodes = automaton?.nodes ?? [];
    const edges = automaton?.edges ?? [];
    return {
      states: nodes.length,
      edges: edges.length,
      conflicts: nodes.filter((node) => node.hasConflict).length,
      items: nodes.reduce((total, node) => total + node.items.length, 0),
    };
  }, [automaton]);

  const applyAutomaton = useCallback((response: LR0AutomatonData, source: string) => {
    setAutomaton(response);
    setSourceLabel(source);
    setLoadedAt(new Date().toLocaleTimeString());
  }, []);

  const loadExampleAutomaton = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchLR0Automaton();
      applyAutomaton(response, '示例 JSON');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [applyAutomaton]);

  const buildAutomaton = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await generateLR0Automaton(grammar);
      applyAutomaton(response, '动态生成');
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : String(buildError));
    } finally {
      setIsLoading(false);
    }
  }, [applyAutomaton, grammar]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void buildAutomaton();
  };

  useEffect(() => {
    void buildAutomaton();
  }, []);

  return (
    <section className="grid min-h-[calc(100vh-190px)] gap-5 xl:grid-rows-[auto_minmax(560px,1fr)]">
      <section className="glass-panel scanner-panel overflow-hidden rounded-[30px]">
        <div className="scanner-panel-header">
          <div className="min-w-0">
            <div className="scanner-kicker">
              <Workflow className="h-4 w-4 text-cyan-200" />
              LR(0) Automaton
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white md:text-3xl">LR(0) 状态机可视化</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              输入文法后由后端实时构造项目集规范族，并返回状态、GOTO 边与冲突标记。
            </p>
          </div>

          <div className="grid w-full gap-3 sm:w-auto sm:min-w-[460px] sm:grid-cols-4">
            <MetricCard icon={Braces} label="States" value={`${stats.states}`} tone="cyan" />
            <MetricCard icon={GitBranch} label="Edges" value={`${stats.edges}`} tone="emerald" />
            <MetricCard icon={ShieldAlert} label="Conflicts" value={`${stats.conflicts}`} tone={stats.conflicts > 0 ? 'red' : 'slate'} />
            <MetricCard icon={Workflow} label="Items" value={`${stats.items}`} tone="slate" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 px-5 pb-5 pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="min-w-0">
            <span className="field-label">Grammar</span>
            <textarea
              className="min-h-[132px] w-full resize-y rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-sm leading-6 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
              value={grammar}
              onChange={(event) => setGrammar(event.target.value)}
              spellCheck={false}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[300px] lg:grid-cols-1">
            <button type="submit" className="btn-primary min-h-12" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              生成状态机
            </button>
            <button type="button" className="btn-secondary min-h-12" onClick={loadExampleAutomaton} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              加载示例
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-5 py-4 text-sm text-slate-400">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            API: <span className="font-mono text-cyan-200">POST /api/lr0/automaton</span>
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            Source: <span className="font-mono text-cyan-200">{sourceLabel}</span>
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            Loaded: <span className="font-mono text-slate-200">{loadedAt || '-'}</span>
          </span>
        </div>
      </section>

      <section className="glass-panel relative min-h-[620px] overflow-hidden rounded-[30px]">
        {isLoading ? (
          <PanelState
            icon={<Loader2 className="h-8 w-8 animate-spin text-cyan-200" />}
            title="正在生成 LR(0) 状态机"
            description="后端正在根据当前文法计算 closure 与 goto。"
          />
        ) : error ? (
          <PanelState
            icon={<AlertTriangle className="h-8 w-8 text-amber-200" />}
            title="状态机生成失败"
            description={error}
          />
        ) : automaton && automaton.nodes.length > 0 ? (
          <ReactFlowProvider>
            <LR0Visualizer automaton={automaton} direction="TB" className="min-h-[620px] rounded-[30px]" />
          </ReactFlowProvider>
        ) : (
          <PanelState
            icon={<Braces className="h-8 w-8 text-slate-300" />}
            title="没有可展示的状态"
            description="后端返回的 LR(0) 状态集为空。"
          />
        )}
      </section>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Braces;
  label: string;
  value: string;
  tone: 'cyan' | 'emerald' | 'red' | 'slate';
}) {
  const colors = {
    cyan: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
    emerald: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
    red: 'border-red-300/25 bg-red-400/15 text-red-100',
    slate: 'border-white/10 bg-white/5 text-slate-200',
  };

  return (
    <div className={`rounded-2xl border px-3 py-3 ${colors[tone]}`}>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-semibold">{value}</div>
    </div>
  );
}

function PanelState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="grid min-h-[620px] place-items-center p-6 text-center">
      <div className="max-w-xl">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">{icon}</div>
        <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 break-words text-sm leading-6 text-slate-400">{description}</p>
      </div>
    </div>
  );
}
