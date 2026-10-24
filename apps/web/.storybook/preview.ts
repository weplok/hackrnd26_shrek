import type { Preview } from '@storybook/react-vite';
import '../src/styles/global.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'zero-day',
      values: [{ name: 'zero-day', value: '#020806' }],
    },
    controls: { expanded: true },
  },
};

export default preview;
