import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        'postgres://hq:local-development-only@127.0.0.1:55432/hq_test',
      APP_BASE_URL: 'http://localhost:3000',
    },
  },
});
