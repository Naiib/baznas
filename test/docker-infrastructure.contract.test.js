import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WORKTREE_ROOT = path.resolve(import.meta.dirname, '..');

test('Docker Infrastructure Contract: Compose and Dockerfiles validation', async (t) => {
  const composePath = path.join(WORKTREE_ROOT, 'compose.production.yml');

  await t.test('compose.production.yml must exist', () => {
    assert.ok(fs.existsSync(composePath), 'compose.production.yml must exist');
  });

  if (!fs.existsSync(composePath)) {
    return;
  }

  const composeContent = fs.readFileSync(composePath, 'utf8');

  await t.test('top-level project name must be web_baznas', () => {
    assert.match(composeContent, /^name:\s*web_baznas/m, 'Project name must be web_baznas');
  });

  await t.test('no fixed container_name and no network_mode: host', () => {
    assert.doesNotMatch(composeContent, /container_name:/, 'No container_name allowed');
    assert.doesNotMatch(composeContent, /network_mode:\s*["']?host["']?/, 'Host networking not allowed');
  });

  await t.test('proxy is the only service that publishes public ports 80 and 443', () => {
    // There should be a proxy service
    assert.match(composeContent, /proxy:/, 'Must declare a proxy service');
    // Check that backend, frontend, postgres do not publish ports
    const lines = composeContent.split('\n');
    let currentService = '';
    const publishedServices = [];
    for (const line of lines) {
      const svcMatch = line.match(/^ {2}([a-zA-Z0-9_-]+):/);
      if (svcMatch) {
        currentService = svcMatch[1];
      }
      if (line.match(/^ {4}ports:/)) {
        publishedServices.push(currentService);
      }
    }
    assert.deepEqual(publishedServices, ['proxy'], 'Only proxy should expose host ports');
  });

  await t.test('PostgreSQL is version 16 and uses named persistent volume', () => {
    assert.match(composeContent, /postgres:16/, 'Must use PostgreSQL 16 image');
    assert.match(composeContent, /volumes:\s*\n[\s\S]*postgres_data:/, 'Must have postgres_data volume');
  });

  await t.test('Backend and Frontend use internal private networks and no host network', () => {
    assert.match(composeContent, /networks:\s*\n[\s\S]*data:\s*\n[\s\S]*internal:\s*true/, 'Data network must be internal');
  });

  await t.test('Core services have healthchecks defined', () => {
    assert.match(composeContent, /postgres:[\s\S]*?healthcheck:/, 'PostgreSQL must have healthcheck');
    assert.match(composeContent, /backend:[\s\S]*?healthcheck:/, 'Backend must have healthcheck');
    assert.match(composeContent, /frontend:[\s\S]*?healthcheck:/, 'Frontend must have healthcheck');
    assert.match(composeContent, /proxy:[\s\S]*?healthcheck:/, 'Proxy must have healthcheck');
  });

  await t.test('Dependency ordering uses service_healthy condition', () => {
    assert.match(composeContent, /condition:\s*service_healthy/, 'Dependencies must wait for service_healthy');
  });

  await t.test('Log rotation is bounded for services', () => {
    assert.match(composeContent, /max-size:/, 'Logging must have max-size');
    assert.match(composeContent, /max-file:/, 'Logging must have max-file');
  });
});

test('Dockerfiles security contract', async (t) => {
  const backendDockerfile = path.join(WORKTREE_ROOT, 'Dockerfile.backend');
  const frontendDockerfile = path.join(WORKTREE_ROOT, 'frontend-next', 'Dockerfile');

  await t.test('Backend Dockerfile does not copy .env files into image', () => {
    assert.ok(fs.existsSync(backendDockerfile), 'Dockerfile.backend must exist');
    const content = fs.readFileSync(backendDockerfile, 'utf8');
    assert.doesNotMatch(content, /COPY\s+\.env/, 'Dockerfile.backend must not COPY .env*');
  });

  await t.test('Backend Dockerfile uses non-root user', () => {
    const content = fs.readFileSync(backendDockerfile, 'utf8');
    assert.match(content, /USER\s+node/, 'Dockerfile.backend should switch to non-root node user');
  });

  await t.test('Frontend Dockerfile uses non-root user', () => {
    const content = fs.readFileSync(frontendDockerfile, 'utf8');
    assert.match(content, /USER\s+node/, 'Frontend Dockerfile should switch to non-root node user');
  });
});
