import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './index';

const meta = {
  title: 'Foundation/Button',
  component: Button,
  args: {
    children: 'ОТКРЫТЬ КЕЙС',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Danger: Story = { args: { variant: 'danger', children: 'ОТМЕНИТЬ ДЕЙСТВИЕ' } };
export const Disabled: Story = { args: { disabled: true } };
