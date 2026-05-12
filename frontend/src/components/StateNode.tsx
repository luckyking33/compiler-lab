import { Handle, Position, type NodeProps } from '@xyflow/react';

type StateNodeData = {
  label: string;
  isAccept: boolean;
  isStart: boolean;
  isActive: boolean;
};

export default function StateNode({ data }: NodeProps) {
  const state = data as unknown as StateNodeData;

  return (
    <div
      className={[
        'relative grid h-20 w-20 place-items-center rounded-full border text-sm font-semibold transition-all duration-300',
        state.isActive
          ? 'border-cyan-300 bg-cyan-300/18 text-white shadow-glow'
          : 'border-white/18 bg-slate-950/80 text-slate-200 shadow-xl',
        state.isAccept ? 'ring-2 ring-emerald-300/80 ring-offset-4 ring-offset-slate-950' : '',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-cyan-300/70" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-cyan-300/70" />
      {state.isStart && (
        <span className="absolute -top-3 rounded-full border border-cyan-300/30 bg-cyan-400/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
          start
        </span>
      )}
      <span>{state.label}</span>
      {state.isAccept && <span className="absolute bottom-2 text-[10px] text-emerald-200">accept</span>}
    </div>
  );
}
