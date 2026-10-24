import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Vulnerability } from '@zero-day/engine';
import { NodeContextMenu } from './NodeContextMenu';
import { Terminal } from './Terminal';

const vulns = [
  { id: 'SL-01', title: 'Пароль на стикере' },
  { id: 'SL-02', title: 'Колесо догадок' },
] as unknown as Vulnerability[];

const meta = {
  title: 'Features/Terminal',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Console: Story = {
  render: () => <Terminal vulns={vulns} />,
};

export const NodeMenu: Story = {
  render: () => (
    <NodeContextMenu
      node="router"
      label="Роутер"
      vulns={vulns}
      onScan={() => undefined}
      onHypothesis={() => undefined}
      onClose={() => undefined}
    />
  ),
};
