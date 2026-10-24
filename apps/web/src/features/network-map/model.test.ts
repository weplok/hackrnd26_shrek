import { describe, expect, it } from 'vitest';
import type { Case, GameState } from '@zero-day/engine';
import { buildNetworkMap } from './model';

const caseData = {
  id: 'case',
  title: 'Тестовая сеть',
  segments: [
    { id: 'open', label: 'Открытый', openAtStart: true },
    { id: 'closed', label: 'Закрытый', openAtStart: false },
  ],
  nodes: [
    {
      id: 'entry',
      kind: 'machine',
      label: 'Вход',
      segment: 'open',
      position: { x: 10, y: 10 },
      inScope: true,
      scanNoise: 3,
      exploits: [],
      failHints: {},
      onCompromise: [],
    },
    {
      id: 'gateway',
      kind: 'machine',
      label: 'Шлюз',
      segment: 'closed',
      position: { x: 55, y: 55 },
      inScope: true,
      scanNoise: 3,
      exploits: [],
      failHints: {},
      onCompromise: [{ openSegment: 'closed' }],
    },
    {
      id: 'hidden',
      kind: 'target',
      label: 'Цель',
      segment: 'closed',
      position: { x: 80, y: 80 },
      inScope: false,
      scanNoise: 3,
      exploits: [],
      failHints: {},
      onCompromise: [],
    },
  ],
  edges: [
    { from: 'entry', to: 'gateway' },
    { from: 'gateway', to: 'hidden' },
  ],
} as unknown as Case;

const gameState = {
  nodes: {
    entry: {
      segment: 'open',
      revealed: true,
      scanned: true,
      compromised: false,
      secured: false,
      alertLevel: 'alerted',
    },
    gateway: {
      segment: 'closed',
      revealed: true,
      scanned: false,
      compromised: false,
      secured: false,
      alertLevel: 'calm',
    },
    hidden: {
      segment: 'closed',
      revealed: false,
      scanned: false,
      compromised: false,
      secured: false,
      alertLevel: 'calm',
    },
  },
  segmentsOpen: { open: true, closed: false },
} as unknown as GameState;

describe('buildNetworkMap', () => {
  it('keeps hidden nodes and their edges out of the map', () => {
    const map = buildNetworkMap(caseData, gameState, 'entry');

    expect(map.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(['entry', 'gateway', 'segment:open', 'segment:closed']),
    );
    expect(map.nodes.map((node) => node.id)).not.toContain('hidden');
    expect(map.edges).toHaveLength(1);
  });

  it('marks a revealed gateway as selectable while its segment is closed', () => {
    const map = buildNetworkMap(caseData, gameState, null);
    const gateway = map.nodes.find((node) => node.id === 'gateway');

    expect(gateway?.type).toBe('network');
    if (gateway?.type !== 'network') throw new Error('Gateway node is missing.');
    expect(gateway.data.isGateway).toBe(true);
    expect(gateway.data.disabled).toBe(false);
  });
});
