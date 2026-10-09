import js from '@eslint/js';
export default [
  {
    ignores: [
      'docs/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '.cache/**',
      '.runtime/**',
      '.test-data/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: ['scripts/**/*.mjs', '*.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        WebSocket: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      eqeqeq: 'error',
      'no-eval': 'error',
    },
  },
];
