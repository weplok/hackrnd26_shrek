import type { Edge, Node } from '@xyflow/react';
import type { Case, ContentNode, GameState, NodeAlertLevel, NodeRuntime } from '@zero-day/engine';
import { ru } from '../../shared/ui/strings';
import { resolveDevice, type DeviceKind } from './icons';

const HORIZONTAL_SCALE = 10;
const VERTICAL_SCALE = 8;
const SEGMENT_PADDING = 92;
const MIN_SEGMENT_WIDTH = 280;
const MIN_SEGMENT_HEIGHT = 220;

export type NetworkVisualState = 'untouched' | 'scanned' | 'compromised' | 'secured';

export type NetworkNodeData = {
  alertLevel: NodeAlertLevel;
  ariaLabel: string;
  device: DeviceKind;
  disabled: boolean;
  inScope: boolean;
  isGateway: boolean;
  kind: ContentNode['kind'];
  label: string;
  selected: boolean;
  state: NetworkVisualState;
};

export type SegmentNodeData = {
  label: string;
  locked: boolean;
};

export type NetworkFlowNode = Node<NetworkNodeData, 'network'>;
export type SegmentFlowNode = Node<SegmentNodeData, 'segment'>;
export type NetworkMapNode = NetworkFlowNode | SegmentFlowNode;
export type NetworkMapEdge = Edge;

export type NetworkMapModel = {
  edges: NetworkMapEdge[];
  nodes: NetworkMapNode[];
};

function visualState(runtime: NodeRuntime): NetworkVisualState {
  if (runtime.secured) return 'secured';
  if (runtime.compromised) return 'compromised';
  if (runtime.scanned) return 'scanned';
  return 'untouched';
}

function isGateway(node: ContentNode): boolean {
  return node.onCompromise.some((effect) => 'openSegment' in effect && effect.openSegment === node.segment);
}

function nodePosition(node: ContentNode): { x: number; y: number } {
  return { x: node.position.x * HORIZONTAL_SCALE, y: node.position.y * VERTICAL_SCALE };
}

function segmentBounds(nodes: ContentNode[]): { height: number; width: number; x: number; y: number } {
  const points = nodes.map(nodePosition);
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const width = Math.max(MIN_SEGMENT_WIDTH, right - left + SEGMENT_PADDING * 2);
  const height = Math.max(MIN_SEGMENT_HEIGHT, bottom - top + SEGMENT_PADDING * 2);

  return {
    x: left + (right - left - width) / 2,
    y: top + (bottom - top - height) / 2,
    width,
    height,
  };
}

function nodeAriaLabel(node: ContentNode, runtime: NodeRuntime, locked: boolean, gateway: boolean): string {
  const state = visualState(runtime);
  const scope = node.inScope ? ru.networkMap.inScope : ru.networkMap.outOfScope;
  const access = locked ? ru.networkMap.locked : gateway ? ru.networkMap.gateway : ru.networkMap.available;
  return `${node.label}. ${ru.networkMap.kind[node.kind]}. ${ru.networkMap.state[state]}. Настороженность: ${ru.networkMap.alert[runtime.alertLevel]}. ${scope}. ${access}.`;
}

export function buildNetworkMap(caseData: Case, gameState: GameState, selectedNodeId: string | null): NetworkMapModel {
  const visibleNodes = caseData.nodes.filter((node) => gameState.nodes[node.id]?.revealed);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const segmentNodes: SegmentFlowNode[] = [];

  for (const segment of caseData.segments) {
    const members = visibleNodes.filter((node) => node.segment === segment.id);
    if (members.length === 0) continue;
    const bounds = segmentBounds(members);
    segmentNodes.push({
      id: `segment:${segment.id}`,
      type: 'segment',
      position: { x: bounds.x, y: bounds.y },
      data: { label: segment.label, locked: !gameState.segmentsOpen[segment.id] },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: 0,
      style: { width: bounds.width, height: bounds.height },
    });
  }

  const nodes: NetworkFlowNode[] = visibleNodes.map((node) => {
    const runtime = gameState.nodes[node.id];
    if (!runtime) throw new Error(`Missing runtime state for ${node.id}.`);
    const gateway = isGateway(node);
    const locked = !gameState.segmentsOpen[node.segment] && !gateway;

    return {
      id: node.id,
      type: 'network',
      position: nodePosition(node),
      origin: [0.5, 0.5],
      data: {
        alertLevel: runtime.alertLevel,
        ariaLabel: nodeAriaLabel(node, runtime, locked, gateway),
        device: resolveDevice(node),
        disabled: locked,
        inScope: node.inScope,
        isGateway: gateway,
        kind: node.kind,
        label: node.label,
        selected: node.id === selectedNodeId,
        state: visualState(runtime),
      },
      draggable: false,
      connectable: false,
      focusable: false,
      selectable: true,
      zIndex: 2,
    };
  });

  const edges: NetworkMapEdge[] = caseData.edges
    .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
    .map((edge) => {
      const from = gameState.nodes[edge.from];
      const to = gameState.nodes[edge.to];
      if (!from || !to) throw new Error(`Missing runtime state for edge ${edge.from}:${edge.to}.`);
      const active = from.compromised || to.compromised;
      const locked = !gameState.segmentsOpen[from.segment] || !gameState.segmentsOpen[to.segment];

      return {
        id: `${edge.from}:${edge.to}`,
        source: edge.from,
        target: edge.to,
        type: 'smoothstep',
        animated: active && !locked,
        selectable: false,
        style: {
          stroke: locked ? 'var(--color-green-dim)' : active ? 'var(--color-green-bright)' : 'var(--color-line)',
          strokeWidth: active ? 2 : 1.25,
        },
      };
    });

  return { nodes: [...segmentNodes, ...nodes], edges };
}

export function isNetworkFlowNode(node: NetworkMapNode): node is NetworkFlowNode {
  return node.type === 'network';
}
