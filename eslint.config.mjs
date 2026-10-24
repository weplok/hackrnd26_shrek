import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.gen.ts',
      '.agents/**',
      '.claude/**',
      '.codex/**',
      '.idea/**',
      '.opencode/**',
      '.pnpm-store/**',
      'packages/ui/storybook-static/**',
      'apps/web/storybook-static/**',
      // Legacy prototype, not wired into main.tsx.
      'apps/web/src/App.tsx',
      'apps/web/src/content.ts',
      'apps/web/src/profile.ts',
      'beta/**',
      'docs/**',
      'backend_api/content/models/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      boundaries,
      'jsx-a11y': jsxA11y,
      'react-hooks': reactHooks,
    },
    settings: {
      'boundaries/elements': [
        { type: 'web', pattern: 'apps/web/**' },
        { type: 'engine', pattern: 'packages/engine/**' },
        { type: 'content-tools', pattern: 'packages/content-tools/**' },
        { type: 'ui', pattern: 'packages/ui/**' },
      ],
    },
    rules: {
      ...boundaries.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
);
