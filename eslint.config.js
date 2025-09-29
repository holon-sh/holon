// ESLint v9+ flat config - ESM
// Currently disabled in favor of Biome for faster linting
// This config is kept for compatibility if needed

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/out/**',
      '**/*.config.js',
      '**/*.config.ts',
      '**/specs/**',
    ]
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        globalThis: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'no-debugger': 'error'
    }
  }
];