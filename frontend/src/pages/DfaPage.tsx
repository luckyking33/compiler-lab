import { ReactFlowProvider } from '@xyflow/react';
import {
  AlertTriangle,
  BookMarked,
  CheckCircle2,
  ChevronRight,
  ChevronsRight,
  Database,
  FolderOpen,
  GripVertical,
  Loader2,
  Play,
  RefreshCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { deleteDfaPreset, fetchDfaPresets, saveDfaPreset, simulateDfa, validateDfaOnServer } from '../api';
import DfaGraph from '../components/DfaGraph';
import {
  cloneDfa,
  defaultDfa,
  edgeId,
  isDfaEmpty,
  joinTokens,
  normalizeDfa,
  splitTokenText,
  validateDfa,
  type DFAConfig,
  type DfaPreset,
  type SimulationStep,
} from '../dfa';

const animationDelay = 800;
const presetStorageKey = 'dfa-presets-v1';
const sidebarWidthStorageKey = 'dfa-sidebar-width-v1';
const desktopBreakpoint = 1280;
const defaultSidebarWidth = 520;
const minSidebarWidth = 420;
const collapseThreshold = 360;
const maxSidebarWidth = 1100;
const collapsedRailWidth = 84;

type FormState = {
  statesText: string;
  alphabetText: string;
  startState: string;
  acceptStatesText: string;
  transitions: Record<string, Record<string, string>>;
};

type DragState = {
  startX: number;
  startWidth: number;
};

export default function DfaPage() {
  const [form, setForm] = useState<FormState>(() => createFormState(defaultDfa));
  const [input, setInput] = useState('ab');
  const [activeState, setActiveState] = useState<string>(defaultDfa.startState);
  const [activeEdge, setActiveEdge] = useState<string>();
  const [visitedEdges, setVisitedEdges] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState<number | undefined>();
  const [isRunning, setIsRunning] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [isPresetPanelOpen, setIsPresetPanelOpen] = useState(false);
  const [presets, setPresets] = useState<DfaPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presetStoreMode, setPresetStoreMode] = useState<'server' | 'local'>('local');
  const [isPresetBusy, setIsPresetBusy] = useState(false);
  const [presetNote, setPresetNote] = useState('点击“已存 DFA”查看或保存当前自动机。');
  const [isWideLayout, setIsWideLayout] = useState(() => getViewportWidth() >= desktopBreakpoint);
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredSidebarWidth());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const runId = useRef(0);

  const dfa = useMemo(() => buildDfaFromForm(form), [form]);
  const localErrors = useMemo(() => validateDfa(dfa), [dfa]);
  const errors = [...localErrors, ...serverErrors];
  const canRun = !isRunning && localErrors.length === 0;
  const preferredSidebarWidth = useMemo(() => {
    const tableWidth = 220 + dfa.alphabet.length * 146;
    const fieldWidth = dfa.states.length > 6 ? 620 : 500;
    return clamp(Math.max(tableWidth, fieldWidth), defaultSidebarWidth, maxSidebarWidth);
  }, [dfa.alphabet.length, dfa.states.length]);
  const compactSidebar = !isWideLayout || sidebarWidth < 560;
  const formColumnsClass = compactSidebar ? 'grid-cols-1' : 'grid-cols-2';

  useEffect(() => {
    function handleResize() {
      setIsWideLayout(getViewportWidth() >= desktopBreakpoint);
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isWideLayout) {
      setIsSidebarCollapsed(false);
    }
  }, [isWideLayout]);

  useEffect(() => {
    if (!isWideLayout || isSidebarCollapsed || isResizingSidebar) {
      return;
    }

    setSidebarWidth((current) => {
      const next = clamp(Math.max(current, preferredSidebarWidth), minSidebarWidth, maxSidebarWidth);
      if (next !== current) {
        writeStoredSidebarWidth(next);
      }
      return next;
    });
  }, [isWideLayout, isSidebarCollapsed, isResizingSidebar, preferredSidebarWidth]);

  useEffect(() => {
    if (!isRunning) {
      setActiveState(dfa.startState);
    }
  }, [dfa.startState, isRunning]);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const nextWidth = dragState.startWidth + (event.clientX - dragState.startX);
      if (nextWidth <= collapseThreshold) {
        setSidebarWidth(collapseThreshold);
        return;
      }

      setSidebarWidth(clamp(nextWidth, minSidebarWidth, maxSidebarWidth));
    }

    function handleMouseUp(event: MouseEvent) {
      const dragState = dragStateRef.current;
      if (!dragState) {
        setIsResizingSidebar(false);
        return;
      }

      const rawWidth = dragState.startWidth + (event.clientX - dragState.startX);
      if (rawWidth <= collapseThreshold) {
        setIsSidebarCollapsed(true);
      } else {
        const nextWidth = clamp(rawWidth, minSidebarWidth, maxSidebarWidth);
        setSidebarWidth(nextWidth);
        writeStoredSidebarWidth(nextWidth);
        setIsSidebarCollapsed(false);
      }

      dragStateRef.current = null;
      setIsResizingSidebar(false);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizingSidebar]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setServerErrors([]);
  }

  function updateTransition(state: string, symbol: string, target: string) {
    setForm((previous) => ({
      ...previous,
      transitions: {
        ...previous.transitions,
        [state]: {
          ...previous.transitions[state],
          [symbol]: target,
        },
      },
    }));
    setServerErrors([]);
  }

  function formatConfig() {
    const emptyBeforeFormat = isDfaEmpty(dfa);
    const normalized = normalizeDfa(dfa);
    setForm(createFormState(normalized));
    setServerErrors([]);
    clearTrace();
    setActiveState(normalized.startState);
    toast.success(emptyBeforeFormat ? '已自动补入默认 DFA 模板' : '已整理当前 DFA 配置');
  }

  async function openPresetPanel() {
    setIsPresetPanelOpen(true);
    await loadPresets();
  }

  async function loadPresets() {
    setIsPresetBusy(true);
    try {
      const response = await fetchDfaPresets();
      setPresets(sortPresets(response.presets));
      setPresetStoreMode('server');
      setPresetNote(response.presets.length > 0 ? '已从后端读取已存 DFA。' : '后端可用，但当前还没有已存 DFA。');
    } catch (error) {
      const localPresets = readLocalPresets();
      setPresets(sortPresets(localPresets));
      setPresetStoreMode('local');
      setPresetNote(
        localPresets.length > 0
          ? `后端暂不可用，当前显示本地缓存。${normalizeError(error)}`
          : `后端暂不可用，当前使用本地缓存。${normalizeError(error)}`,
      );
    } finally {
      setIsPresetBusy(false);
    }
  }

  async function persistCurrentPreset() {
    const normalized = normalizeDfa(dfa);
    const name = presetName.trim();

    if (!name) {
      toast.error('请先输入 DFA 名称');
      return;
    }

    setIsPresetBusy(true);
    try {
      const preset = await saveDfaPreset({ name, dfa: normalized });
      setPresetStoreMode('server');
      setPresetNote('已保存到后端。');
      setPresets((previous) => sortPresets(upsertPreset(previous, preset)));
      setPresetName('');
      toast.success('DFA 已保存到后端');
    } catch (error) {
      const saved = saveLocalPreset(name, normalized);
      setPresetStoreMode('local');
      setPresetNote(`后端暂不可用，已保存到本地缓存。${normalizeError(error)}`);
      setPresets((previous) => sortPresets(upsertPreset(previous, saved)));
      setPresetName('');
      toast.success('DFA 已保存到本地缓存');
    } finally {
      setIsPresetBusy(false);
    }
  }

  async function removePreset(id: string) {
    setIsPresetBusy(true);
    try {
      await deleteDfaPreset(id);
      setPresetStoreMode('server');
      setPresetNote('已从后端删除。');
      setPresets((previous) => previous.filter((preset) => preset.id !== id));
      toast.success('已删除已存 DFA');
    } catch (error) {
      removeLocalPreset(id);
      setPresetStoreMode('local');
      setPresetNote(`后端暂不可用，已尝试从本地缓存删除。${normalizeError(error)}`);
      setPresets((previous) => previous.filter((preset) => preset.id !== id));
      toast.success('已从本地缓存删除');
    } finally {
      setIsPresetBusy(false);
    }
  }

  function loadPresetToEditor(preset: DfaPreset) {
    setForm(createFormState(cloneDfa(preset.dfa)));
    setActiveState(preset.dfa.startState);
    setServerErrors([]);
    clearTrace();
    setIsPresetPanelOpen(false);
    toast.success(`已载入 ${preset.name}`);
  }

  async function checkWithServer() {
    if (localErrors.length > 0) {
      toast.error('请先修正当前 DFA 配置');
      return;
    }

    setServerErrors([]);
    try {
      const result = await validateDfaOnServer(dfa);
      setServerErrors(result.valid ? [] : result.errors);
      if (result.valid) {
        toast.success('后端校验通过');
      } else {
        toast.error('后端校验未通过');
      }
    } catch (error) {
      const message = normalizeError(error);
      setServerErrors([`后端校验失败: ${message}`]);
      toast.error('后端校验失败', { description: message });
    }
  }

  async function startSimulation() {
    if (!canRun) {
      return;
    }

    setServerErrors([]);
    clearTrace();
    setIsRunning(true);
    const thisRun = runId.current + 1;
    runId.current = thisRun;

    try {
      const result = await simulateDfa(dfa, input);
      if (result.error) {
        toast.error('模拟失败', { description: result.error });
      }

      await playSteps(dfa, result.steps, thisRun);

      if (runId.current === thisRun) {
        setActiveState(result.finalState);
        setCurrentIndex(undefined);
        if (result.accepted) {
          toast.success('Accepted (接受)');
        } else {
          toast.error('Rejected (拒绝)', { description: result.error });
        }
      }
    } catch (error) {
      const message = normalizeError(error);
      setServerErrors([`模拟接口调用失败: ${message}`]);
      toast.error('模拟接口调用失败', { description: message });
    } finally {
      if (runId.current === thisRun) {
        setIsRunning(false);
      }
    }
  }

  async function playSteps(currentDfa: DFAConfig, steps: SimulationStep[], thisRun: number) {
    setActiveState(currentDfa.startState);
    await sleep(220);

    for (const step of steps) {
      if (runId.current !== thisRun) {
        return;
      }

      const graphEdgeId = findGraphEdgeId(currentDfa, step.from, step.to, step.symbol);
      setCurrentIndex(step.index);
      setActiveState(step.from);
      setActiveEdge(graphEdgeId);
      setVisitedEdges((previous) => new Set(previous).add(graphEdgeId));
      await sleep(animationDelay);
      setActiveState(step.to);
    }

    setActiveEdge(undefined);
  }

  function resetSimulation() {
    runId.current += 1;
    setIsRunning(false);
    clearTrace();
    setActiveState(dfa.startState);
    setCurrentIndex(undefined);
  }

  function clearTrace() {
    setActiveEdge(undefined);
    setVisitedEdges(new Set());
    setCurrentIndex(undefined);
  }

  function expandSidebar() {
    const nextWidth = clamp(Math.max(sidebarWidth, preferredSidebarWidth), minSidebarWidth, maxSidebarWidth);
    setSidebarWidth(nextWidth);
    setIsSidebarCollapsed(false);
    writeStoredSidebarWidth(nextWidth);
  }

  function startSidebarResize(event: React.MouseEvent<HTMLButtonElement>) {
    if (!isWideLayout) {
      return;
    }

    dragStateRef.current = {
      startX: event.clientX,
      startWidth: sidebarWidth,
    };
    setIsResizingSidebar(true);
    event.preventDefault();
  }

  return (
    <>
      <section className="flex min-h-[calc(100vh-190px)] flex-1 flex-col gap-5 xl:flex-row">
          {isWideLayout && isSidebarCollapsed ? (
            <aside
              className="collapsed-sidebar-rail glass-panel hidden xl:flex"
              style={{ width: `${collapsedRailWidth}px` }}
            >
              <button className="collapsed-sidebar-button" onClick={expandSidebar} aria-label="展开 DFA 定义面板">
                <ChevronsRight className="h-5 w-5" />
              </button>
              <div className="collapsed-sidebar-text">DFA 定义</div>
            </aside>
          ) : (
            <aside
              className="glass-panel relative flex min-h-[680px] w-full min-w-0 flex-col overflow-hidden rounded-[30px] xl:shrink-0"
              style={isWideLayout ? { width: `${sidebarWidth}px` } : undefined}
            >
              <div className="border-b border-white/10 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">DFA 定义</h2>
                    <p className="mt-1 text-sm text-slate-400">结构化五元组填写</p>
                  </div>
                  <Database className="h-5 w-5 text-cyan-200" />
                </div>

                <div className={`mt-4 grid gap-2 ${compactSidebar ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <button className="btn-secondary" onClick={openPresetPanel} disabled={isRunning}>
                    <FolderOpen className="h-4 w-4" />
                    已存 DFA
                  </button>
                  <button className="btn-secondary" onClick={formatConfig} disabled={isRunning}>
                    <RefreshCcw className="h-4 w-4" />
                    格式化
                  </button>
                </div>

                <button className="btn-ghost mt-2 w-full" onClick={checkWithServer} disabled={isRunning}>
                  <CheckCircle2 className="h-4 w-4" />
                  后端校验
                </button>
              </div>

              <div className="flex-1 overflow-x-hidden overflow-y-auto p-5">
                <div className="grid gap-4">
                  <FieldBlock
                    label="状态集"
                    hint="逗号分隔，例如 q0, q1, q2"
                    value={form.statesText}
                    onChange={(value) => updateField('statesText', value)}
                  />
                  <FieldBlock
                    label="字母表"
                    hint="逗号分隔，例如 a, b"
                    value={form.alphabetText}
                    onChange={(value) => updateField('alphabetText', value)}
                  />

                  <div className={`grid gap-4 ${formColumnsClass}`}>
                    <div>
                      <label className="field-label">开始状态</label>
                      <select
                        className="field-input"
                        value={form.startState}
                        onChange={(event) => updateField('startState', event.target.value)}
                      >
                        <option value="">请选择开始状态</option>
                        {dfa.states.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </div>
                    <FieldBlock
                      label="接受状态"
                      hint="逗号分隔，例如 q2"
                      value={form.acceptStatesText}
                      onChange={(value) => updateField('acceptStatesText', value)}
                    />
                  </div>

                  <section className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-white">转移函数表</h3>
                        <p className="mt-1 text-xs text-slate-400">行是当前状态，列是输入符号，单元格填写目标状态。</p>
                      </div>
                      <BookMarked className="h-4 w-4 shrink-0 text-cyan-200" />
                    </div>

                    {dfa.states.length === 0 || dfa.alphabet.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
                        先填写状态集和字母表，转移表会自动展开。
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table
                          className="w-full border-separate border-spacing-0 text-sm"
                          style={{ minWidth: `${220 + dfa.alphabet.length * 146}px` }}
                        >
                          <thead>
                            <tr>
                              <th className="table-head sticky left-0 z-10 min-w-24">状态</th>
                              {dfa.alphabet.map((symbol) => (
                                <th key={symbol} className="table-head min-w-28">
                                  {symbol}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dfa.states.map((state) => (
                              <tr key={state}>
                                <th className="table-side sticky left-0 z-10">{state}</th>
                                {dfa.alphabet.map((symbol) => (
                                  <td key={`${state}-${symbol}`} className="table-cell">
                                    <select
                                      className="table-select"
                                      value={dfa.transitions[state]?.[symbol] ?? ''}
                                      onChange={(event) => updateTransition(state, symbol, event.target.value)}
                                    >
                                      <option value="">请选择</option>
                                      {dfa.states.map((targetState) => (
                                        <option key={targetState} value={targetState}>
                                          {targetState}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              </div>

              <div className="border-t border-white/10 p-5">
                {errors.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
                    <CheckCircle2 className="h-4 w-4" />
                    当前配置可以直接用于绘图和演示
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      需要修正
                    </div>
                    <ul className="space-y-1 text-xs leading-5 text-amber-50/90">
                      {errors.slice(0, 5).map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {isWideLayout ? (
                <button
                  className={`sidebar-resize-handle ${isResizingSidebar ? 'is-active' : ''}`}
                  onMouseDown={startSidebarResize}
                  aria-label="调整 DFA 定义面板宽度"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              ) : null}
            </aside>
          )}

          <div className="grid min-w-0 flex-1 gap-5 lg:grid-rows-[minmax(520px,1fr)_auto]">
            <section className="glass-panel min-h-[520px] overflow-hidden rounded-[30px]">
              <ReactFlowProvider>
                <DfaGraph dfa={dfa} activeState={activeState} activeEdge={activeEdge} visitedEdges={visitedEdges} />
              </ReactFlowProvider>
            </section>

            <section className="glass-panel rounded-[30px] p-5">
              <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="min-w-0">
                  <label className="text-sm font-medium text-slate-300">待测试字符串</label>
                  <input
                    className="mt-2 h-14 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 font-mono text-lg text-white outline-none transition focus:border-cyan-300/60 focus:shadow-glow"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    disabled={isRunning}
                    placeholder='例如 "aba"'
                  />
                  <CharacterRail value={input} activeIndex={currentIndex} />
                </div>
                <div className="grid grid-cols-2 gap-2 lg:w-[280px]">
                  <button className="btn-primary h-14" onClick={startSimulation} disabled={!canRun}>
                    {isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                    开始演示
                  </button>
                  <button className="btn-secondary h-14" onClick={resetSimulation}>
                    <RefreshCcw className="h-5 w-5" />
                    重置
                  </button>
                </div>
              </div>
              <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                <StatusPill label="当前状态" value={activeState || '-'} tone="cyan" />
                <StatusPill label="已走过边" value={`${visitedEdges.size}`} tone="emerald" />
                <StatusPill label="速度" value="800ms / 字符" tone="slate" />
              </div>
            </section>
          </div>
      </section>

      {isPresetPanelOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
          <div className="glass-panel max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[30px]">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-white">已存 DFA</h2>
                <p className="mt-1 text-sm text-slate-400">{presetNote}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-cyan-100">
                  {presetStoreMode === 'server' ? 'server' : 'local'}
                </span>
                <button className="btn-secondary" onClick={() => setIsPresetPanelOpen(false)}>
                  关闭
                </button>
              </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-3 overflow-y-auto pr-1 lg:max-h-[60vh]">
                {isPresetBusy && presets.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-8 text-center text-sm text-slate-300">
                    正在加载已存 DFA...
                  </div>
                ) : presets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
                    还没有已存 DFA。你可以在右侧给当前配置命名并保存。
                  </div>
                ) : (
                  presets.map((preset) => (
                    <article key={preset.id} className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-white">{preset.name}</h3>
                          <p className="mt-1 text-xs text-slate-400">更新于 {formatTimestamp(preset.updatedAt)}</p>
                        </div>
                        <button className="icon-btn" onClick={() => removePreset(preset.id)} disabled={isPresetBusy}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                        <span className="preset-chip">{preset.dfa.states.length} 个状态</span>
                        <span className="preset-chip">{preset.dfa.alphabet.length} 个符号</span>
                        <span className="preset-chip">开始: {preset.dfa.startState || '-'}</span>
                      </div>
                      <button className="btn-primary mt-4 w-full" onClick={() => loadPresetToEditor(preset)}>
                        <ChevronRight className="h-4 w-4" />
                        载入此 DFA
                      </button>
                    </article>
                  ))
                )}
              </div>

              <aside className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
                <h3 className="text-base font-semibold text-white">保存当前配置</h3>
                <p className="mt-1 text-sm text-slate-400">给当前 DFA 取一个名字，之后可以一键载入继续编辑。</p>
                <label className="field-label mt-4">DFA 名称</label>
                <input
                  className="field-input"
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="例如：以 ab 结尾"
                />
                <button className="btn-primary mt-4 w-full" onClick={persistCurrentPreset} disabled={isPresetBusy}>
                  <Save className="h-4 w-4" />
                  保存当前 DFA
                </button>
                <button className="btn-secondary mt-2 w-full" onClick={loadPresets} disabled={isPresetBusy}>
                  <RefreshCcw className="h-4 w-4" />
                  刷新列表
                </button>
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      <Toaster richColors position="top-right" toastOptions={{ className: 'font-sans' }} />
    </>
  );
}

function FieldBlock({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <label className="field-label">{label}</label>
      <input className="field-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={hint} />
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function CharacterRail({ value, activeIndex }: { value: string; activeIndex?: number }) {
  const chars = value.split('');

  return (
    <div className="mt-3 flex min-h-12 flex-wrap items-center gap-2">
      {chars.length === 0 ? (
        <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-500">空串 ε</span>
      ) : (
        chars.map((char, index) => (
          <span
            key={`${char}-${index}`}
            className={[
              'grid h-10 min-w-10 place-items-center rounded-xl border px-3 font-mono text-sm transition-all duration-300',
              index === activeIndex
                ? 'border-emerald-300 bg-emerald-300/18 text-emerald-50 shadow-emerald'
                : index < (activeIndex ?? -1)
                  ? 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100'
                  : 'border-white/10 bg-white/5 text-slate-300',
            ].join(' ')}
          >
            {char}
          </span>
        ))
      )}
    </div>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: 'cyan' | 'emerald' | 'slate' }) {
  const colors = {
    cyan: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
    emerald: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
    slate: 'border-white/10 bg-white/5 text-slate-200',
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${colors[tone]}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 font-mono text-base">{value}</div>
    </div>
  );
}

function buildDfaFromForm(form: FormState): DFAConfig {
  const states = splitTokenText(form.statesText);
  const alphabet = splitTokenText(form.alphabetText);
  const acceptStates = splitTokenText(form.acceptStatesText);
  const transitions: Record<string, Record<string, string>> = {};

  states.forEach((state) => {
    transitions[state] = {};
    alphabet.forEach((symbol) => {
      transitions[state][symbol] = form.transitions[state]?.[symbol]?.trim() ?? '';
    });
  });

  return {
    states,
    alphabet,
    startState: form.startState.trim(),
    acceptStates,
    transitions,
  };
}

function createFormState(dfa: DFAConfig): FormState {
  const normalized = normalizeDfa(dfa);
  return {
    statesText: joinTokens(normalized.states),
    alphabetText: joinTokens(normalized.alphabet),
    startState: normalized.startState,
    acceptStatesText: joinTokens(normalized.acceptStates),
    transitions: normalized.transitions,
  };
}

function findGraphEdgeId(dfa: DFAConfig, from: string, to: string, symbol: string) {
  const labels = Object.entries(dfa.transitions[from] || {})
    .filter(([, target]) => target === to)
    .map(([label]) => label)
    .sort()
    .join(',');

  return edgeId(from, to, labels || symbol);
}

function readLocalPresets() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(presetStorageKey);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw) as DfaPreset[];
  } catch {
    return [];
  }
}

function writeLocalPresets(presets: DfaPreset[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(presetStorageKey, JSON.stringify(presets));
}

function saveLocalPreset(name: string, dfa: DFAConfig) {
  const presets = readLocalPresets();
  const preset: DfaPreset = {
    id: `local-${Date.now()}`,
    name,
    dfa: cloneDfa(dfa),
    updatedAt: new Date().toISOString(),
  };

  const next = upsertPreset(presets, preset);
  writeLocalPresets(next);
  return preset;
}

function removeLocalPreset(id: string) {
  const presets = readLocalPresets().filter((preset) => preset.id !== id);
  writeLocalPresets(presets);
}

function upsertPreset(presets: DfaPreset[], preset: DfaPreset) {
  const next = presets.filter((item) => item.id !== preset.id);
  next.push(preset);
  return next;
}

function sortPresets(presets: DfaPreset[]) {
  return [...presets].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getViewportWidth() {
  if (typeof window === 'undefined') {
    return desktopBreakpoint;
  }
  return window.innerWidth;
}

function readStoredSidebarWidth() {
  if (typeof window === 'undefined') {
    return defaultSidebarWidth;
  }

  const raw = window.localStorage.getItem(sidebarWidthStorageKey);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? clamp(parsed, minSidebarWidth, maxSidebarWidth) : defaultSidebarWidth;
}

function writeStoredSidebarWidth(width: number) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(sidebarWidthStorageKey, String(width));
}
