import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Meter, Modal, Panel, Sheet, Toast, Tooltip } from './index';

const meta = {
  title: 'Foundation/Surfaces',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PanelAndMeter: Story = {
  render: () => (
    <Panel className="zd-story-stack" title="СТАТУС ОПЕРАЦИИ">
      <Meter label="ТРЕВОГА" status="warning" value={42} valueText="42 / 100" />
      <Toast title="СИСТЕМА ГОТОВА" variant="success">
        Данные загружены из локального среза.
      </Toast>
    </Panel>
  ),
};

export const SideSheet: Story = {
  render: () => (
    <Sheet className="zd-story-stack" title="ЦЕЛИ">
      <p>Проверь доступную поверхность и зафиксируй первую улику.</p>
      <Tooltip content="Подсказки доступны с клавиатуры.">
        <span>Наведи указатель или перейди сюда клавишей Tab.</span>
      </Tooltip>
    </Sheet>
  ),
};

export const Dialog: Story = {
  render: () => <DialogExample />,
};

function DialogExample(): ReactNode {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="zd-story-actions">
      <Button
        onClick={() => {
          setIsOpen(true);
        }}
        variant="primary"
      >
        ОТКРЫТЬ ДИАЛОГ
      </Button>
      <Modal
        closeLabel="Закрыть диалог"
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
        }}
        title="ПОДТВЕРЖДЕНИЕ"
      >
        <p>Окно закрывается кнопкой или клавишей Escape.</p>
      </Modal>
    </div>
  );
}
