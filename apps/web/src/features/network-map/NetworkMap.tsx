import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, type NodeProps } from '@xyflow/react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { Case, GameState } from '@zero-day/engine';
import { ru } from '../../shared/ui/strings';
import { buildNetworkMap, type NetworkFlowNode, type NetworkMapNode, type SegmentFlowNode } from './model';
import './network-map.css';
import '@xyflow/react/dist/style.css';

export type NetworkMapProps = {
  caseData: Case;
  gameState: GameState;
  onSelectNode: (nodeId: string) => void;
  selectedNodeId: string | null;
};

const KIND_ICON: Record<NetworkFlowNode['data']['kind'], string> = {
  machine: '▣',
  person: '◉',
  object: '◇',
  target: '◎',
  decoy: '◌',
};

const ALERT_ICON: Record<NetworkFlowNode['data']['alertLevel'], string> = {
  calm: '○',
  alerted: '△',
  detected: '!',
};

export function NetworkMap({ caseData, gameState, onSelectNode, selectedNodeId }: NetworkMapProps): ReactNode {
  const { nodes, edges } = useMemo(
    () => buildNetworkMap(caseData, gameState, selectedNodeId),
    [caseData, gameState, selectedNodeId],
  );
  const interactiveNodes = useMemo(
    () =>
      nodes.map((node) => {
        if (node.type !== 'network') return node;
        return { ...node, data: { ...node.data, onSelect: onSelectNode } };
      }),
    [nodes, onSelectNode],
  );

  return (
    <section aria-label={ru.networkMap.title} className="network-map">
      <header className="network-map__header">
        <div>
          <span className="network-map__eyebrow">{ru.networkMap.eyebrow}</span>
          <h2>{caseData.title}</h2>
        </div>
        <span className="network-map__count">
          {ru.networkMap.count(nodes.filter((node) => node.type === 'network').length)}
        </span>
      </header>
      <div className="network-map__canvas">
        <ReactFlow<NetworkMapNode>
          aria-label={ru.networkMap.canvasLabel(caseData.title)}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          maxZoom={1.45}
          minZoom={0.42}
          nodes={interactiveNodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodesFocusable={false}
          nodeTypes={nodeTypes}
          panOnDrag
          panOnScroll
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
        >
          <Background color="var(--color-line)" gap={28} size={1} variant={BackgroundVariant.Dots} />
          <Controls aria-label={ru.networkMap.controlsLabel} showInteractive={false} />
        </ReactFlow>
      </div>
      <MapLegend />
    </section>
  );
}

type InteractiveNodeData = NetworkFlowNode['data'] & { onSelect: (nodeId: string) => void };
type InteractiveNode = Omit<NetworkFlowNode, 'data'> & { data: InteractiveNodeData };

function NetworkNode({ data, id }: NodeProps<InteractiveNode>): ReactNode {
  return (
    <div
      className={`network-map__node network-map__node--${data.state} network-map__node--${data.alertLevel}${
        data.selected ? ' network-map__node--selected' : ''
      }${data.disabled ? ' network-map__node--locked' : ''}${data.inScope ? '' : ' network-map__node--out-of-scope'}`}
    >
      <Handle className="network-map__handle" isConnectable={false} position={Position.Left} type="target" />
      <button
        aria-label={data.ariaLabel}
        aria-pressed={data.selected}
        className="network-map__node-button nodrag nopan"
        disabled={data.disabled}
        onClick={() => {
          data.onSelect(id);
        }}
        type="button"
      >
        <span aria-hidden="true" className="network-map__node-kind">
          {KIND_ICON[data.kind]}
        </span>
        <span className="network-map__node-label">{data.label}</span>
        <span className="network-map__node-status">
          <span aria-hidden="true">{ALERT_ICON[data.alertLevel]}</span> {ru.networkMap.state[data.state]}
        </span>
        {data.isGateway ? <span className="network-map__node-gateway">{ru.networkMap.gateway}</span> : null}
        {!data.inScope ? (
          <span className="network-map__node-scope">{ru.networkMap.outOfScope.toUpperCase()}</span>
        ) : null}
      </button>
      <Handle className="network-map__handle" isConnectable={false} position={Position.Right} type="source" />
    </div>
  );
}

function SegmentNode({ data }: NodeProps<SegmentFlowNode>): ReactNode {
  return (
    <div aria-hidden="true" className={`network-map__segment${data.locked ? ' network-map__segment--locked' : ''}`}>
      <span>{data.label}</span>
      {data.locked ? <strong>{ru.networkMap.closed}</strong> : null}
    </div>
  );
}

const nodeTypes = { network: NetworkNode, segment: SegmentNode };

function MapLegend(): ReactNode {
  return (
    <div className="network-map__legend">
      <span>
        <b className="network-map__legend-mark network-map__legend-mark--calm">○</b> {ru.networkMap.legend.calm}
      </span>
      <span>
        <b className="network-map__legend-mark network-map__legend-mark--alerted">△</b> {ru.networkMap.legend.alerted}
      </span>
      <span>
        <b className="network-map__legend-mark network-map__legend-mark--detected">!</b> {ru.networkMap.legend.detected}
      </span>
      <span>
        <b className="network-map__legend-mark network-map__legend-mark--scope">▨</b> {ru.networkMap.legend.scope}
      </span>
    </div>
  );
}
