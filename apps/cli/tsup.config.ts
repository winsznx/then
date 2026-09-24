import { defineConfig } from 'tsup'

/**
 * One file, dist/then.mjs. Workspace packages ship as TypeScript source, so they are bundled in;
 * third-party packages stay external and come from this package's dependencies.
 */
export default defineConfig({
  entry: { then: 'src/main.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  splitting: false,
  noExternal: [/^@then\//],
  outExtension: () => ({ js: '.mjs' }),
})
