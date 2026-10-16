import { test, expect } from './browser-fixtures.mjs';

test('verify unauthenticated user cannot access protected internal API routes', async ({ request }) => {
  const protectedEndpoints = [
    '/api/auth/me',
    '/api/mustahik',
    '/api/penyaluran/overview',
    '/api/penyaluran/mustahik/3/workspace',
    '/api/penyaluran/mustahik/3/ppd'
  ];

  for (const endpoint of protectedEndpoints) {
    const res = await request.get(endpoint);
    // Unauthenticated requests must fail-closed with 401 or 403
    expect([401, 403]).toContain(res.status());
  }
});
