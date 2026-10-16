export function requiresPostgres(env = process.env) {
  return env.NODE_ENV === 'production';
}

export function allowsDemoSeed(env = process.env) {
  return !requiresPostgres(env);
}
