import fs from 'node:fs';

/**
 * Reads a secret value either from an environment variable directly
 * or from a file pointed to by `<ENV_VAR>_FILE` (Docker Secrets convention).
 *
 * @param {string} envVarName - Name of environment variable (e.g. 'DB_PASSWORD')
 * @param {string} [defaultValue=''] - Default value if neither is set
 * @returns {string} The secret string trimmed of trailing newlines
 */
export function getSecret(envVarName, defaultValue = '') {
  const fileVarName = `${envVarName}_FILE`;
  const filePath = process.env[fileVarName];

  if (filePath && fs.existsSync(filePath)) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (err) {
      console.error(`Failed to read secret from ${fileVarName} (${filePath}):`, err.message);
    }
  }

  if (process.env[envVarName] !== undefined) {
    return process.env[envVarName];
  }

  return defaultValue;
}

/**
 * Bootstrap secrets into process.env from *_FILE variables if present.
 * Ensures backward-compatibility with all existing modules reading process.env directly.
 */
export function bootstrapSecrets() {
  const secretVars = [
    'DB_PASSWORD',
    'PGPASSWORD',
    'JWT_SECRET',
    'PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY',
    'TELEGRAM_BOT_TOKEN',
    'OLLAMA_API_KEY'
  ];

  for (const varName of secretVars) {
    const fileVar = `${varName}_FILE`;
    const filePath = process.env[fileVar];
    if (filePath && fs.existsSync(filePath)) {
      try {
        process.env[varName] = fs.readFileSync(filePath, 'utf8').trim();
      } catch (err) {
        console.error(`Failed to bootstrap secret ${varName} from ${filePath}:`, err.message);
      }
    }
  }
}
