const requiredKeys = [
  'M6_UAT_BASE_URL',
  'M6_UAT_STAFF_USERNAME',
  'M6_UAT_STAFF_PASSWORD',
  'M6_UAT_FINANCE_USERNAME',
  'M6_UAT_FINANCE_PASSWORD',
  'M6_UAT_APPLICANT_NAME',
  'M6_UAT_APPLICANT_NIK',
  'M6_UAT_APPLICANT_KK',
  'M6_UAT_APPLICANT_PHONE',
  'M6_UAT_STAFF_CASE_NAME',
  'M6_UAT_PPD_REVIEW_CASE_NAME',
  'M6_UAT_DOCUMENT_NAME',
];

function value(env, key) {
  const result = String(env[key] ?? '').trim();
  if (!result) throw new Error(`Missing required M6 browser UAT input: ${key}`);
  return result;
}

function isLoopback(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || host === '::1'
    || host === '0:0:0:0:0:0:0:1'
    || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function assertStagingOrigin(url, env = process.env) {
  if (isLoopback(url.hostname)) return;
  if (env.M6_UAT_DOCKER_STAGING === '1' && url.protocol === 'http:' && url.hostname === 'caddy' && (url.port === '' || url.port === '80')) return;
  const stageHost = url.hostname.toLowerCase().split('.')
    .slice(0, -1)
    .some((label) => /^(?:staging|stage|uat|test|dev)$/.test(label));
  if (!stageHost || url.protocol !== 'https:') {
    throw new Error('M6 browser UAT target must use loopback via tunnel or an HTTPS staging hostname.');
  }
}

function parseOrigin(raw, key, env) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid origin value for ${key}.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${key} must contain only an HTTP(S) origin, without credentials, path, query, or fragment.`);
  }
  assertStagingOrigin(url, env);
  return url.origin;
}

export function resolveUatConfig(env = process.env) {
  const missing = requiredKeys.filter((key) => !String(env[key] ?? '').trim());
  if (missing.length) throw new Error(`Missing required M6 browser UAT inputs: ${missing.join(', ')}`);

  let baseUrl;
  try {
    baseUrl = new URL(value(env, 'M6_UAT_BASE_URL'));
  } catch {
    throw new Error('M6_UAT_BASE_URL must be an absolute HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol)
      || baseUrl.username || baseUrl.password || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash) {
    throw new Error('M6_UAT_BASE_URL must be an origin-only HTTP(S) URL without credentials, path, query, or fragment.');
  }
  assertStagingOrigin(baseUrl, env);
  baseUrl.pathname = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;

  const declaredOrigins = String(env.M6_UAT_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const declaredOriginSet = new Set(
    declaredOrigins.map((origin) => parseOrigin(origin, 'M6_UAT_ALLOWED_ORIGINS', env)),
  );
  if (!isLoopback(baseUrl.hostname) && !(env.M6_UAT_DOCKER_STAGING === '1' && baseUrl.protocol === 'http:' && baseUrl.hostname === 'caddy' && (baseUrl.port === '' || baseUrl.port === '80')) && !declaredOriginSet.has(baseUrl.origin)) {
    throw new Error('Remote M6 browser UAT targets must be explicitly listed in M6_UAT_ALLOWED_ORIGINS.');
  }
  const allowedOrigins = new Set([baseUrl.origin, ...declaredOriginSet]);

  const applicantName = value(env, 'M6_UAT_APPLICANT_NAME');
  const nik = value(env, 'M6_UAT_APPLICANT_NIK');
  const kk = value(env, 'M6_UAT_APPLICANT_KK');
  const phone = value(env, 'M6_UAT_APPLICANT_PHONE');
  const syntheticName = /^M6 UAT\b/i;
  if (!syntheticName.test(applicantName)
      || !/^99\d{14}$/.test(nik)
      || !/^99\d{14}$/.test(kk)
      || !/^000\d{7,11}$/.test(phone)) {
    throw new Error('Applicant inputs must use the documented M6 UAT synthetic name and sentinel identifiers.');
  }

  const staffCaseName = value(env, 'M6_UAT_STAFF_CASE_NAME');
  const ppdReviewCaseName = value(env, 'M6_UAT_PPD_REVIEW_CASE_NAME');
  if (!syntheticName.test(staffCaseName) || !syntheticName.test(ppdReviewCaseName)) {
    throw new Error('Workspace case names must identify dedicated M6 UAT synthetic records.');
  }

  const staffUsername = value(env, 'M6_UAT_STAFF_USERNAME');
  const financeUsername = value(env, 'M6_UAT_FINANCE_USERNAME');
  if (!/^m6-uat-staff-/i.test(staffUsername)
      || !/^m6-uat-finance-/i.test(financeUsername)) {
    throw new Error('Staff and finance logins must be dedicated M6 UAT synthetic identities.');
  }
  return Object.freeze({
    baseUrl,
    allowedOrigins,
    staff: Object.freeze({
      username: staffUsername,
      password: value(env, 'M6_UAT_STAFF_PASSWORD'),
    }),
    finance: Object.freeze({
      username: financeUsername,
      password: value(env, 'M6_UAT_FINANCE_PASSWORD'),
    }),
    applicant: Object.freeze({ name: applicantName, nik, kk, phone }),
    staffCaseName,
    ppdReviewCaseName,
    documentName: value(env, 'M6_UAT_DOCUMENT_NAME'),
  });
}
