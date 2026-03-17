import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main')
    }
  },
  test: {
    include: ['tests/e2e.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000
  }
})
