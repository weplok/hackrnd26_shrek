import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Case, Flipper, GameState } from '@zero-day/engine';
import { GameHud } from './GameHud';

const caseData = {
  title: 'Колледж: доступ к деканату',
  tracks: [
    { id: 'alarm', label: 'Тревога', start: 0 },
    { id: 'logs', label: 'Логи', start: 0 },
  ],
  objectives: [
    { id: 'recon', title: 'Осмотреть сеть деканата' },
    { id: 'access', title: 'Получить доступ' },
  ],
} as Case;

const caseRun = {
  caseId: 'L2C1',
  flags: { flipperJoined: true },
  tracks: { alarm: 0, logs: 0 },
  objectives: { recon: false, access: false },
} as unknown as GameState;

const flipper = {
  schemaVersion: 1,
  lines: [],
} satisfies Flipper;

const meta = {
  title: 'Game/HUD',
  component: GameHud,
  args: {
    caseData,
    caseRun,
    flipper,
    level: 2,
  },
} satisfies Meta<typeof GameHud>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Calm: Story = {};

export const Alert: Story = {
  args: {
    caseRun: {
      ...caseRun,
      tracks: { alarm: 60, logs: 15 },
      objectives: { recon: true, access: false },
    },
  },
};

export const Critical: Story = {
  args: {
    caseRun: {
      ...caseRun,
      tracks: { alarm: 90, logs: 80 },
      objectives: { recon: true, access: true },
    },
  },
};
