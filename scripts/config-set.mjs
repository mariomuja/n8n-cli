#!/usr/bin/env node
/**
 * Set n8n config values (endpoint, apikey, project).
 * Creates config/n8n-config.local.json from example if missing.
 * Usage: node config-set.mjs <endpoint|apikey|project> <value>
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = resolve(__dirname, '..', 'config');
const localPath = resolve(configDir, 'n8n-config.local.json');
const examplePath = resolve(configDir, 'n8n-config.example.json');

const FIELD_MAP = {
  endpoint: 'baseUrl',
  apikey: 'apiKey',
  project: 'projectId',
};

async function main() {
  const [field, value] = process.argv.slice(2);
  if (!field || !value) {
    console.log(`
n8n-cli Config

Usage:
  npm run config:endpoint -- <n8n-URL>
  npm run config:apikey -- <api-key>
  npm run config:project -- <project-id>

Examples:
  npm run config:endpoint -- https://your-n8n-instance.example.com
  npm run config:apikey -- eyJhbGciOiJIUzI1NiIs...
  npm run config:project -- YTJDvJZNATPEAMzD

Config is saved to config/n8n-config.local.json
`);
    process.exit(1);
  }

  const key = FIELD_MAP[field.toLowerCase()];
  if (!key) {
    console.error(`Unknown field: "${field}". Allowed: endpoint, apikey, project`);
    process.exit(1);
  }

  let config = {};
  try {
    const content = await readFile(localPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    try {
      const content = await readFile(examplePath, 'utf-8');
      config = JSON.parse(content);
    } catch (err) {
      console.error('Config not found. Create config/n8n-config.example.json');
      process.exit(1);
    }
  }

  config[key] = value.trim();
  if (key === 'projectId' && (value === '' || value.toLowerCase() === 'none')) {
    delete config.projectId;
  }

  await mkdir(configDir, { recursive: true });
  await writeFile(localPath, JSON.stringify(config, null, 2), 'utf-8');

  const display = key === 'apiKey' && value.length > 24 ? value.slice(0, 20) + '...' : value;
  console.log(`\n✓ ${field} set: ${display}`);
  console.log(`  Saved to: ${localPath}\n`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
