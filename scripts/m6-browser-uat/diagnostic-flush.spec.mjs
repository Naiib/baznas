import { test } from './browser-fixtures.mjs';

test.fail('afterEach waits for delayed request diagnostics before asserting', async ({ browserProblems }) => {
  browserProblems.trackDiagnostic(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return 'GET http://caddy/api/[id] resource=fetch error=net::ERR_FAILED';
  });
});
