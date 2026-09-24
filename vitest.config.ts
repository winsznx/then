import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'packages/*/test/**/*.test.ts',
            'apps/cli/test/**/*.test.ts',
            'apps/mcp/test/**/*.test.ts',
          ],
          exclude: ['**/*.live.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'live',
          include: ['packages/*/test/**/*.live.test.ts'],
          testTimeout: 60_000,
        },
      },
    ],
  },
})
