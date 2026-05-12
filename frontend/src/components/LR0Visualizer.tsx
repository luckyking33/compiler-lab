import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import dagre from 'dagre';
import { useMemo } from 'react';

export type LR0AutomatonState = {
  id: string;
  items: string[];
  hasConflict: boolean;
};

export type LR0AutomatonEdge = {
  source: string;
  target: string;
  label: string;
};

export type LR0AutomatonData = {
  nodes: LR0AutomatonState[];
  edges: LR0AutomatonEdge[];
};

type LayoutDirection = 'TB' | 'LR';

type LR0NodeData = {
  label: string;
  items: string[];
  hasConflict: boolean;
  direction: LayoutDirection;
};

type LR0VisualizerProps = {
  automaton: LR0AutomatonData;
  direction?: LayoutDirection;
  className?: string;
};

const nodeTypes = {
  lr0State: LR0StateNode,
};

const nodeWidth = 360;
const minNodeHeight = 118;
const itemLineHeight = 24;

export default function LR0Visualizer({ automaton, direction = 'TB', className = '' }: LR0VisualizerProps) {
  const { nodes, edges } = useMemo(() => buildFlowElements(automaton, direction), [automaton, direction]);

  return (
    <div className={`h-full min-h-[560px] w-full overflow-hidden rounded-[24px] bg-[#080b12] ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.25}
        maxZoom={1.8}
        nodesDraggable
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="rgba(148, 163, 184, 0.18)"
          gap={24}
          size={1}
          variant={BackgroundVariant.Lines}
          className="bg-[#080b12]"
        />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => (readNodeData(node).hasConflict ? '#ef4444' : '#22d3ee')}
          nodeStrokeColor={(node) => (readNodeData(node).hasConflict ? '#fed7aa' : '#a5f3fc')}
          maskColor="rgba(2, 6, 23, 0.72)"
          className="!border !border-white/10 !bg-slate-950/85"
        />
        <Controls className="!border-white/10 !bg-slate-950/85 !text-slate-100" />
      </ReactFlow>
    </div>
  );
}

function LR0StateNode({ data }: NodeProps) {
  const state = data as unknown as LR0NodeData;
  const targetPosition = state.direction === 'LR' ? Position.Left : Position.Top;
  const sourcePosition = state.direction === 'LR' ? Position.Right : Position.Bottom;

  return (
    <article
      className={[
        'relative w-[360px] overflow-hidden rounded-lg border text-left shadow-xl transition-all duration-200',
        state.hasConflict
          ? 'border-red-400/80 bg-red-950/60 ring-2 ring-red-500/70 shadow-[0_0_38px_rgba(248,113,113,0.42)]'
          : 'border-cyan-300/25 bg-slate-950/90 ring-1 ring-white/5 shadow-[0_20px_55px_rgba(0,0,0,0.38)]',
      ].join(' ')}
    >
      <Handle type="target" position={targetPosition} className="!h-2.5 !w-2.5 !border-0 !bg-cyan-200/90" />
      <Handle type="source" position={sourcePosition} className="!h-2.5 !w-2.5 !border-0 !bg-emerald-300/90" />

      <header
        className={[
          'flex items-center justify-between gap-3 border-b px-4 py-3',
          state.hasConflict ? 'border-red-300/20 bg-red-400/10' : 'border-white/10 bg-white/[0.035]',
        ].join(' ')}
      >
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">LR(0) State</div>
          <h3 className="mt-1 font-mono text-lg font-bold text-white">I{state.label}</h3>
        </div>
        {state.hasConflict ? (
          <span className="rounded-full border border-red-300/40 bg-red-400/20 px-2.5 py-1 text-xs font-semibold text-red-100">
            Conflict
          </span>
        ) : (
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
            OK
          </span>
        )}
      </header>

      <div className="max-h-[340px] overflow-auto px-4 py-3 font-mono text-[13px] leading-6 text-slate-200">
        {state.items.map((item, index) => (
          <div key={`${state.label}-${item}-${index}`} className="whitespace-pre rounded-md px-2 py-0.5 odd:bg-white/[0.035]">
            {item}
          </div>
        ))}
      </div>
    </article>
  );
}

function buildFlowElements(automaton: LR0AutomatonData, direction: LayoutDirection) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    ranksep: direction === 'TB' ? 110 : 120,
    nodesep: direction === 'TB' ? 70 : 90,
    marginx: 48,
    marginy: 48,
  });

  const nodeHeights = new Map<string, number>();
  const sourcePosition = direction === 'LR' ? Position.Right : Position.Bottom;
  const targetPosition = direction === 'LR' ? Position.Left : Position.Top;

  automaton.nodes.forEach((state) => {
    const height = Math.max(minNodeHeight, 74 + state.items.length * itemLineHeight);
    nodeHeights.set(state.id, height);
    graph.setNode(state.id, { width: nodeWidth, height });
  });

  automaton.edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const nodes: Node[] = automaton.nodes.map((state) => {
    const layoutNode = graph.node(state.id);
    const height = nodeHeights.get(state.id) ?? minNodeHeight;

    return {
      id: state.id,
      type: 'lr0State',
      position: {
        x: layoutNode.x - nodeWidth / 2,
        y: layoutNode.y - height / 2,
      },
      sourcePosition,
      targetPosition,
      data: {
        label: state.id,
        items: state.items,
        hasConflict: state.hasConflict,
        direction,
      } satisfies LR0NodeData,
    };
  });

  const edges: Edge[] = automaton.edges.map((edge, index) => ({
    id: `${edge.source}-${edge.target}-${edge.label || 'edge'}-${index}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#22d3ee',
      width: 22,
      height: 22,
    },
    style: {
      stroke: '#22d3ee',
      strokeWidth: 2.4,
      filter: 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.78))',
    },
    labelStyle: {
      fill: '#d9f99d',
      fontWeight: 800,
      fontSize: 13,
    },
    labelBgStyle: {
      fill: 'rgba(2, 6, 23, 0.9)',
      stroke: 'rgba(163, 230, 53, 0.28)',
      strokeWidth: 1,
    },
    labelBgPadding: [8, 5],
    labelBgBorderRadius: 8,
  }));

  return { nodes, edges };
}

function readNodeData(node: Node) {
  return node.data as unknown as LR0NodeData;
}
