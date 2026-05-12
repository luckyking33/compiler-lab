import { AlertTriangle, Braces, Loader2, Rocket, ScanSearch, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { scanSourceCode, type ScannerToken } from '../api';

const defaultSource = `int main() {
  int count = 0;
  float ratio = 1.5;

  while (count < 10) {
    count++;
    ratio = ratio + 0.25;
  }

  return count;
}`;

const tokenGroups = {
  keyword: new Set(['INT', 'FLOAT', 'VOID', 'IF', 'ELSE', 'WHILE', 'RETURN', 'INPUT', 'PRINT']),
  identifier: new Set(['ID']),
  number: new Set(['NUM', 'FLO']),
  operator: new Set(['ADD', 'SUB', 'MUL', 'DIV', 'ROP', 'BOP', 'ASG', 'AAS', 'AAA']),
  delimiter: new Set(['LPA', 'RPA', 'LBK', 'RBK', 'LBR', 'RBR', 'CMA', 'SCO']),
};

function getTokenTone(type: string) {
  if (tokenGroups.keyword.has(type)) {
    return 'border-purple-400/30 bg-purple-400/12 text-purple-300';
  }

  if (tokenGroups.identifier.has(type)) {
    return 'border-sky-400/30 bg-sky-400/12 text-sky-300';
  }

  if (tokenGroups.number.has(type)) {
    return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-300';
  }

  if (tokenGroups.operator.has(type)) {
    return 'border-amber-400/30 bg-amber-400/12 text-amber-300';
  }

  if (tokenGroups.delimiter.has(type)) {
    return 'border-slate-300/20 bg-slate-300/10 text-slate-200';
  }

  return 'border-rose-400/30 bg-rose-400/12 text-rose-300';
}

function getTokenGroupLabel(type: string) {
  if (tokenGroups.keyword.has(type)) return 'Keyword';
  if (tokenGroups.identifier.has(type)) return 'Identifier';
  if (tokenGroups.number.has(type)) return 'Constant';
  if (tokenGroups.operator.has(type)) return 'Operator';
  if (tokenGroups.delimiter.has(type)) return 'Delimiter';
  return 'Invalid';
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export default function ScannerPage() {
  const [source, setSource] = useState(defaultSource);
  const [tokens, setTokens] = useState<ScannerToken[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const lineNumbers = useMemo(() => source.split('\n'), [source]);

  const summary = useMemo(() => {
    const counts = {
      keywords: 0,
      identifiers: 0,
      constants: 0,
      operators: 0,
      delimiters: 0,
      invalid: 0,
    };

    for (const token of tokens) {
      if (tokenGroups.keyword.has(token.type)) counts.keywords += 1;
      else if (tokenGroups.identifier.has(token.type)) counts.identifiers += 1;
      else if (tokenGroups.number.has(token.type)) counts.constants += 1;
      else if (tokenGroups.operator.has(token.type)) counts.operators += 1;
      else if (tokenGroups.delimiter.has(token.type)) counts.delimiters += 1;
      else counts.invalid += 1;
    }

    return counts;
  }, [tokens]);

  async function handleScan() {
    setIsScanning(true);
    setErrorMessage('');

    try {
      const result = await scanSourceCode(source);
      setTokens(result.tokens);
      toast.success(`Scanner finished with ${result.tokens.length} tokens`);
    } catch (error) {
      const message = normalizeError(error);
      setTokens([]);
      setErrorMessage(message);
      toast.error('Scanner request failed', { description: message });
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <main className="grid min-h-[calc(100vh-190px)] gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(520px,0.9fr)]">
      <section className="glass-panel scanner-panel overflow-hidden rounded-[30px]">
        <div className="scanner-panel-header">
          <div>
            <div className="scanner-kicker">
              <Sparkles className="h-3.5 w-3.5" />
              Lab 2 Scanner Console
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Source Editor</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Paste or edit a C-like snippet, then send it to the cloud scanner service for tokenization.
            </p>
          </div>
          <div className="scanner-stats-grid">
            <StatCard label="Lines" value={String(source.split('\n').length)} />
            <StatCard label="Chars" value={String(source.length)} />
          </div>
        </div>

        <div className="scanner-editor-wrap">
          <div className="scanner-editor-toolbar">
            <div className="inline-flex items-center gap-2 text-sm text-slate-300">
              <Braces className="h-4 w-4 text-cyan-300" />
              temp.c
            </div>
            <button type="button" className="btn-secondary" onClick={() => setSource(defaultSource)} disabled={isScanning}>
              Reset Example
            </button>
          </div>

          <div className="scanner-editor-shell">
            <div className="scanner-line-gutter" aria-hidden="true">
              <div className="scanner-line-gutter-track" style={{ transform: `translateY(-${editorScrollTop}px)` }}>
                {lineNumbers.map((_, index) => (
                  <span key={`line-${index + 1}`} className="scanner-line-number">
                    {index + 1}
                  </span>
                ))}
              </div>
            </div>

            <textarea
              className="scanner-editor"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              onScroll={(event) => setEditorScrollTop(event.currentTarget.scrollTop)}
              spellCheck={false}
              disabled={isScanning}
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="scanner-chip">while</span>
              <span className="scanner-chip">int</span>
              <span className="scanner-chip">float</span>
              <span className="scanner-chip">++</span>
            </div>
            <button type="button" className="scanner-launch-btn" onClick={handleScan} disabled={isScanning}>
              {isScanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
              Start Lexical Analysis
            </button>
          </div>
        </div>
      </section>

      <section className="glass-panel scanner-panel overflow-hidden rounded-[30px]">
        <div className="scanner-panel-header border-b border-white/10">
          <div>
            <div className="scanner-kicker">
              <ScanSearch className="h-3.5 w-3.5" />
              Token Stream
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Token Stream</h2>
            <p className="mt-2 text-sm text-slate-400">Tokens are rendered in sequence with category-aware color badges.</p>
          </div>
          <div className="scanner-stats-grid">
            <StatCard label="Tokens" value={String(tokens.length)} />
            <StatCard label="Invalid" value={String(summary.invalid)} tone="rose" />
          </div>
        </div>

        <div className="scanner-summary-grid">
          <SummaryCard label="Keywords" value={summary.keywords} tone="purple" />
          <SummaryCard label="Identifiers" value={summary.identifiers} tone="sky" />
          <SummaryCard label="Constants" value={summary.constants} tone="emerald" />
          <SummaryCard label="Operators" value={summary.operators} tone="amber" />
          <SummaryCard label="Delimiters" value={summary.delimiters} tone="slate" />
          <SummaryCard label="Invalid" value={summary.invalid} tone="rose" />
        </div>

        {errorMessage ? (
          <div className="mx-5 mb-5 flex items-start gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <div className="scanner-table-wrap">
          {tokens.length === 0 ? (
            <div className="scanner-empty-state">
              <div className="scanner-empty-orb" />
              <h3 className="text-lg font-semibold text-white">No tokens yet</h3>
              <p className="mt-2 max-w-md text-center text-sm text-slate-400">
                Run the scanner to see the token stream appear here with category badges and staggered animation.
              </p>
            </div>
          ) : (
            <div className="scanner-table">
              <div className="scanner-table-head">
                <span>#</span>
                <span>Type</span>
                <span>Category</span>
                <span>Lexeme</span>
              </div>

              <div className="scanner-table-body">
                {tokens.map((token, index) => (
                  <div
                    key={`${token.type}-${token.value}-${index}`}
                    className="scanner-token-row"
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    <span className="scanner-index">{index + 1}</span>
                    <span className={`scanner-badge ${getTokenTone(token.type)}`}>{token.type}</span>
                    <span className="scanner-category">{getTokenGroupLabel(token.type)}</span>
                    <code className="scanner-lexeme">{token.value || '(empty)'}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <Toaster richColors position="top-right" toastOptions={{ className: 'font-sans' }} />
    </main>
  );
}

function StatCard({ label, value, tone = 'cyan' }: { label: string; value: string; tone?: 'cyan' | 'rose' }) {
  const toneClass =
    tone === 'rose'
      ? 'border-rose-400/20 bg-rose-400/10 text-rose-100'
      : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100';

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 font-mono text-lg">{value}</div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'purple' | 'sky' | 'emerald' | 'amber' | 'slate' | 'rose';
}) {
  const toneMap = {
    purple: 'border-purple-400/20 bg-purple-400/10 text-purple-200',
    sky: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    slate: 'border-white/10 bg-white/5 text-slate-200',
    rose: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneMap[tone]}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 font-mono text-base">{value}</div>
    </div>
  );
}
