const knownSegments = new Set([
  'api', 'auth', 'login', 'logout', 'me', 'mustahik', 'penyaluran', 'workspace',
  'ppd', 'receipt', 'artifacts', 'documents', 'stages', 'count', 'stats',
  'overview', 'pengajuan', 'cek-pengajuan', 'penerimaan', 'tracking', 'public',
  '_next', 'static',
]);

export function normalizedRequestPath(pathname) {
  return pathname.split(/[?#]/, 1)[0].split('/').map((part) => (
    part === '' || knownSegments.has(part) ? part : '[id]'
  )).join('/');
}

export function enqueueRequestDiagnostic(pending, task, problems) {
  let release;
  const signal = new Promise((resolve) => { release = resolve; });
  const diagnostic = Promise.resolve()
    .then(() => signal)
    .then(task)
    .then((label) => { if (label) problems.push(`browser network request failed: ${label}`); })
    .catch(() => problems.push('browser network request failed: diagnostic unavailable'));
  diagnostic.release = release;
  pending.add(diagnostic);
  void diagnostic.finally(() => pending.delete(diagnostic));
}

export function isSpeculativeRscAbort({ method, pathname, resourceType, errorCode, headers }) {
  return method === 'GET'
    && !pathname.startsWith('/api/')
    && resourceType === 'fetch'
    && errorCode === 'net::ERR_ABORTED'
    && Object.hasOwn(headers, 'rsc')
    && Object.hasOwn(headers, 'next-router-prefetch');
}

export function isSupersededRscNavigationAbort({ method, pathname, resourceType, errorCode, headers, requestInfo, events }) {
  if (method !== 'GET'
      || pathname.startsWith('/api/')
      || resourceType !== 'fetch'
      || errorCode !== 'net::ERR_ABORTED'
      || !Object.hasOwn(headers, 'rsc')) return false;

  const navigation = events.find((event) => (
    event.type === 'frame'
      && event.sequence > (requestInfo?.frameSequence ?? 0)
      && event.at >= (requestInfo?.at ?? Number.POSITIVE_INFINITY)
      && event.routePath !== requestInfo?.routePath
  ));
  if (!navigation) return false;

  return events.some((event) => (
    event.type === 'response'
      && event.routePath === navigation.routePath
      && event.path === navigation.routePath
      && event.status < 400
      && event.at >= navigation.at
  ));
}

export function correlateFailedRequest({ request, requestInfo, routePath, events, elapsedMs }) {
  const url = new URL(request.url());
  const headers = requestInfo?.headers ?? {};
  const failure = request.failure()?.errorText ?? '';
  const errorCode = /^net::ERR_[A-Z_]+$/.test(failure) ? failure : 'other';
  const routeChanged = requestInfo?.routePath !== routePath;
  const replacementResponse = events.some((event) => (
    event.type === 'response'
      && event.routePath === routePath
      && event.path === routePath
      && event.resource === request.resourceType()
      && event.status < 400
      && event.at >= (requestInfo?.at ?? 0)
  ));
  return [
    `${request.method()} ${url.origin}${normalizedRequestPath(url.pathname)}`,
    `resource=${request.resourceType()}`,
    `rsc=${Object.hasOwn(headers, 'rsc')}`,
    `prefetch=${Object.hasOwn(headers, 'next-router-prefetch')}`,
    `error=${errorCode}`,
    `elapsed-ms=${Math.max(0, Math.round(elapsedMs))}`,
    `route-changed=${routeChanged}`,
    `replacement-response=${replacementResponse}`,
    `from-route=${requestInfo?.routePath ?? 'unknown'}`,
    `to-route=${routePath}`,
    `frame-seq=${requestInfo?.frameSequence ?? 0}`,
  ].join(' ');
}

export async function flushRequestDiagnostics(pending) {
  for (const item of [...pending]) {
    if (typeof item.release === 'function') item.release();
  }
  while (pending.size > 0) await Promise.all([...pending]);
}

export async function describeFailedRequest(request, millisecondsSinceNavigation) {
  const url = new URL(request.url());
  const headers = await request.allHeaders().catch(() => ({}));
  const failure = request.failure()?.errorText ?? '';
  const errorCode = /^net::ERR_[A-Z_]+$/.test(failure) ? failure : 'other';
  return [
    `${request.method()} ${url.origin}${normalizedRequestPath(url.pathname)}`,
    `resource=${request.resourceType()}`,
    `rsc=${Object.hasOwn(headers, 'rsc')}`,
    `prefetch=${Object.hasOwn(headers, 'next-router-prefetch')}`,
    `error=${errorCode}`,
    `since-navigation-ms=${Math.max(0, Math.round(millisecondsSinceNavigation))}`,
  ].join(' ');
}
