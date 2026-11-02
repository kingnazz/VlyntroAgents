import { expect, type APIRequestContext } from '@playwright/test';

// Exercise the real limiter without weakening it for tests. Full dashboard refreshes
// deliberately read every operational resource, so reserve a budget between flows.
export async function waitForApiBudget(
  request: APIRequestContext,
  minimum = 240,
) {
  await expect
    .poll(
      async () => {
        const response = await request.get('/api/v1/health');
        return Number(response.headers()['x-ratelimit-remaining'] ?? 300);
      },
      { timeout: 75000, intervals: [1500, 3000, 5000] },
    )
    .toBeGreaterThanOrEqual(minimum);
}
