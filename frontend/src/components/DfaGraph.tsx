import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { useMemo } from 'react';
import type { DFAConfig } from '../dfa';
import { edgeId } from '../dfa';
import StartNode from './StartNode';
import StateNode from './StateNode';

const nodeTypes = {
  state: StateNode,
  start: StartNode,
};

type DfaGraphProps = {
  dfa: DFAConfig;
  activeState?: string;
  activeEdge?: string;
  visitedEdges: Set<string>;
};

export default function DfaGraph({ dfa, activeState, activeEdge, visitedEdges }: DfaGraphProps) {
  const { nodes, edges } = useMemo(() => buildGraph(dfa, activeState, activeEdge, visitedEdges), [
    dfa,
    activeState,
    activeEdge,
    visitedEdges,
  ]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      nodesDraggable
      proOptions={{ hideAttribution: true }}
      className="rounded-[28px]"
    >
      <Background color="rgba(148, 163, 184, 0.16)" gap={28} />
      <Controls className="!border-white/10 !bg-slate-950/80 !text-slate-100" />
    </ReactFlow>
  );
}

function buildGraph(dfa: DFAConfig, activeState?: string, activeEdge?: string, visitedEdges = new Set<string>()) {
  const radius = Math.max(150, dfa.states.length * 42);
  const centerX = 360;
  const centerY = 260;
  const acceptSet = new Set(dfa.acceptStates);
  const stateSet = new Set(dfa.states);

  const nodes: Node[] = dfa.states.map((state, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(dfa.states.length, 1) - Math.PI / 2;
    return {
      id: state,
      type: 'state',
      position: {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      },
      data: {
        label: state,
        isAccept: acceptSet.has(state),
        isStart: state === dfa.startState,
        isActive: state === activeState,
      },
    };
  });

  const startNode: Node = {
    id: '__start',
    type: 'start',
    position: {
      x: centerX - radius - 150,
      y: centerY - 6,
    },
    data: {},
    selectable: false,
    draggable: false,
  };

  const grouped = new Map<string, { from: string; to: string; labels: string[] }>();
  Object.entries(dfa.transitions || {}).forEach(([from, table]) => {
    Object.entries(table || {}).forEach(([symbol, to]) => {
      if (!stateSet.has(from) || !stateSet.has(to) || !symbol) {
        return;
      }
      const key = `${from}->${to}`;
      const item = grouped.get(key) ?? { from, to, labels: [] };
      item.labels.push(symbol);
      grouped.set(key, item);
    });
  });

  const startEdges: Edge[] = stateSet.has(dfa.startState)
    ? [
        {
          id: '__start_edge',
          source: '__start',
          target: dfa.startState,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#67e8f9' },
          style: { stroke: '#67e8f9', strokeWidth: 2, strokeDasharray: '6 8' },
          animated: true,
        },
      ]
    : [];

  const edges: Edge[] = [
    ...startEdges,
    ...Array.from(grouped.values()).map(({ from, to, labels }) => {
      const label = labels.sort().join(',');
      const id = edgeId(from, to, label);
      const isActive = id === activeEdge;
      const isVisited = visitedEdges.has(id);
      const isSelf = from === to;

      return {
        id,
        source: from,
        target: to,
        label,
        type: isSelf ? 'default' : 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: isActive ? '#34d399' : '#94a3b8' },
        animated: isActive,
        style: {
          stroke: isActive ? '#34d399' : isVisited ? '#22d3ee' : 'rgba(148, 163, 184, 0.72)',
          strokeWidth: isActive ? 4 : isVisited ? 3 : 2,
          filter: isActive ? 'drop-shadow(0 0 10px rgba(52, 211, 153, 0.75))' : undefined,
        },
        labelStyle: {
          fill: isActive ? '#bbf7d0' : '#cbd5e1',
          fontWeight: 700,
        },
        labelBgStyle: {
          fill: 'rgba(2, 6, 23, 0.84)',
          stroke: 'rgba(255,255,255,0.08)',
        },
      } satisfies Edge;
    }),
  ];

  return { nodes: [startNode, ...nodes], edges };
}
