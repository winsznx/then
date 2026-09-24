import tseslint from 'typescript-eslint'

/** Packages and the CLI. The web app has its own Next.js lint config in apps/web. */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'apps/web/**',
      '.internal/**',
      '.then/**',
      'receipts/**',
      'fixtures/**',
      'coverage/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
)
