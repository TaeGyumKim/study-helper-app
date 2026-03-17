import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main')
    }
  },
  test: {
    include: ['tests/types.test.ts'],
    testTimeout: 10_000
  }
})
