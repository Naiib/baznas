import os
import re

patterns = [
    re.compile(r'(?i)(password|secret|key|token)\s*[:=]\s*["\'](?!.*\$\{)[a-zA-Z0-9_\-]{8,}["\']'),
    re.compile(r'postgresql:\/\/[^:]+:[^@]+@'),
    re.compile(r'BEGIN (?:RSA|OPENSSH|EC|PGP)? PRIVATE KEY'),
]

files_to_check = [
    'compose.production.yml',
    'Dockerfile.backend',
    'frontend-next/Dockerfile',
    '.dockerignore',
    'frontend-next/.dockerignore',
    'server/secrets.js',
    'server/secrets.test.js',
    'deploy/docker/Caddyfile',
    'deploy/docker/preflight.sh',
    'deploy/docker/build-release.sh',
    'deploy/docker/smoke-check.sh',
    'deploy/docker/db-backup.sh',
    'deploy/docker/db-restore.sh',
    'deploy/docker/files-backup.sh',
    'deploy/docker/files-restore.sh',
    'deploy/docker/parity-audit.sh',
    'deploy/docker/rollback-pre-write.sh',
    'deploy/docker/rollback-post-write.sh',
    'deploy/docker/backup-cleanup.sh',
    'test/docker-infrastructure.contract.test.js',
    'server/index.js'
]

findings = []
for file_path in files_to_check:
    if not os.path.exists(file_path):
        continue
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line_num, line in enumerate(f, 1):
            if 'secrets.test.js' in file_path:
                continue
            for pat in patterns:
                if pat.search(line):
                    findings.append((file_path, line_num))

if not findings:
    print('SECRET_SCAN_OK: Zero secrets detected.')
else:
    print(f'WARNING: {len(findings)} findings detected:')
    for fp, ln in findings:
        print(f'  - {fp}:{ln}')
