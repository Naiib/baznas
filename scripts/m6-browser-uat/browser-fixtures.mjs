import { test as base, expect } from '@playwright/test';
import { resolveUatConfig } from './safety.mjs';
import { correlateFailedRequest, enqueueRequestDiagnostic, flushRequestDiagnostics, isSpeculativeRscAbort, isSupersededRscNavigationAbort, normalizedRequestPath } from './request-diagnostics.mjs';

export const uat = resolveUatConfig(process.env);
const allowedOrigins = uat.allowedOrigins;

function requestLabel(request) {
  const url = new URL(request.url());
  const knownSegments = new Set([
    'api', 'auth', 'login', 'logout', 'me', 'mustahik', 'penyaluran', 'workspace',
    'ppd', 'receipt', 'artifacts', 'documents', 'stages', 'count', 'stats',
    'overview', 'pengajuan', 'cek-pengajuan', 'penerimaan', 'tracking', 'public',
    '_next', 'static',
  ]);
  const path = url.pathname.split('/').map((part) => (
    part === '' || knownSegments.has(part) ? part : '[id]'
  )).join('/');
  return `${request.method()} ${url.origin}${path}`;
}

export const test = base.extend({
  browserProblems: [async ({ page }, use) => {
    const problems = [];
    const pendingDiagnostics = new Set();
    const requestInfo = new WeakMap();
    const events = [];
    const routePath = () => normalizedRequestPath(new URL(page.url()).pathname);
    const now = () => Date.now();
    let frameSequence = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        frameSequence += 1;
        events.push({ type: 'frame', routePath: normalizedRequestPath(new URL(frame.url()).pathname), at: now(), sequence: frameSequence });
      }
    });
    page.on('request', (request) => {
      const info = { routePath: routePath(), at: now(), headers: {}, frameSequence };
      requestInfo.set(request, info);
      info.headersPromise = request.allHeaders().then((headers) => { info.headers = headers; }).catch(() => {});
    });
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push('browser console error');
    });
    page.on('pageerror', () => problems.push('uncaught browser exception'));
    page.on('requestfailed', (request) => {
      try {
        if (allowedOrigins.has(new URL(request.url()).origin)) {
          const failure = request.failure()?.errorText ?? '';
          if (failure === 'net::ERR_ABORTED' && request.isNavigationRequest()) return;
          enqueueRequestDiagnostic(
            pendingDiagnostics,
            async () => {
              const info = requestInfo.get(request);
              await info?.headersPromise;
              const url = new URL(request.url());
              if (isSpeculativeRscAbort({
                method: request.method(),
                pathname: url.pathname,
                resourceType: request.resourceType(),
                errorCode: failure,
                headers: info?.headers ?? {},
              })) return null;
              if (isSupersededRscNavigationAbort({
                method: request.method(),
                pathname: url.pathname,
                resourceType: request.resourceType(),
                errorCode: failure,
                headers: info?.headers ?? {},
                requestInfo: info,
                events,
              })) return null;
              return correlateFailedRequest({ request, requestInfo: info, routePath: routePath(), events, elapsedMs: now() - (info?.at ?? now()) });
            },
            problems,
          );
        }
      } catch {
        problems.push('invalid browser request URL');
      }
    });
    page.on('response', (response) => {
      try {
        events.push({ type: 'response', routePath: routePath(), path: normalizedRequestPath(new URL(response.url()).pathname), resource: response.request().resourceType(), status: response.status(), at: now() });
        if (response.status() >= 400 && allowedOrigins.has(new URL(response.url()).origin)) {
          problems.push(`browser network response ${response.status()}: ${requestLabel(response.request())}`);
        }
      } catch {
        problems.push('invalid browser response URL');
      }
    });

    await page.context().route('**/*', async (route) => {
      let origin;
      try {
        origin = new URL(route.request().url()).origin;
      } catch {
        problems.push('invalid browser request URL');
        await route.abort();
        return;
      }
      if (!allowedOrigins.has(origin)) {
        problems.push(`browser request blocked outside the staging origin allowlist: ${requestLabel(route.request())}`);
        await route.abort();
        return;
      }
      await route.continue();
    });

    await use({
      problems,
      trackDiagnostic: (task) => enqueueRequestDiagnostic(pendingDiagnostics, task, problems),
      flush: () => flushRequestDiagnostics(pendingDiagnostics),
    });
    await flushRequestDiagnostics(pendingDiagnostics);
  }, { auto: true }],
});

test.afterEach(async ({ browserProblems }) => {
  await browserProblems.flush();
  expect(browserProblems.problems).toEqual([]);
});

export { expect };
