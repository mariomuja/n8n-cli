#!/usr/bin/env node
/**
 * Tests for loadConfig().
 * Run with: npm run test:client (from n8n-cli)
 */

import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/n8n-client.js';

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
};

export async function runLoadConfigTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  const tmpDir = join(tmpdir(), `n8n-test-${Date.now()}`);

  const run = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}: ${(err as Error).message}`);
      failed++;
    }
  };

  console.log('\n--- loadConfig tests ---\n');

  await run('loadConfig throws when no config exists', async () => {
    const orig = process.env.N8N_CONFIG_FILE;
    process.env.N8N_CONFIG_FILE = join(tmpDir, 'nonexistent.json');
    try {
      await loadConfig();
      assert(false, 'Expected loadConfig to throw');
    } catch (e) {
      assert(String(e).includes('Failed to load') || String(e).includes('ENOENT'), `Unexpected error: ${e}`);
    } finally {
      if (orig !== undefined) process.env.N8N_CONFIG_FILE = orig;
      else delete process.env.N8N_CONFIG_FILE;
    }
  });

  await run('loadConfig throws when config missing baseUrl', async () => {
    await mkdir(tmpDir, { recursive: true });
    const badConfig = join(tmpDir, 'bad.json');
    await writeFile(badConfig, JSON.stringify({ apiKey: 'x' }), 'utf-8');
    const orig = process.env.N8N_CONFIG_FILE;
    process.env.N8N_CONFIG_FILE = badConfig;
    try {
      await loadConfig();
      assert(false, 'Expected loadConfig to throw');
    } catch (e) {
      assert(String(e).includes('baseUrl') || String(e).includes('apiKey'), `Unexpected error: ${e}`);
    } finally {
      if (orig !== undefined) process.env.N8N_CONFIG_FILE = orig;
      else delete process.env.N8N_CONFIG_FILE;
      await rm(badConfig, { force: true });
    }
  });

  await run('loadConfig loads valid config from N8N_CONFIG_FILE', async () => {
    await mkdir(tmpDir, { recursive: true });
    const validConfig = join(tmpDir, 'valid.json');
    await writeFile(
      validConfig,
      JSON.stringify({ baseUrl: 'https://test.example.com', apiKey: 'test-key' }),
      'utf-8'
    );
    const orig = process.env.N8N_CONFIG_FILE;
    process.env.N8N_CONFIG_FILE = validConfig;
    try {
      const config = await loadConfig();
      assert(config.baseUrl === 'https://test.example.com', 'baseUrl mismatch');
      assert(config.apiKey === 'test-key', 'apiKey mismatch');
    } finally {
      if (orig !== undefined) process.env.N8N_CONFIG_FILE = orig;
      else delete process.env.N8N_CONFIG_FILE;
      await rm(validConfig, { force: true });
    }
  });

  await run('loadConfig loads retries and debug options', async () => {
    await mkdir(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'extended.json');
    await writeFile(
      configPath,
      JSON.stringify({
        baseUrl: 'https://test.example.com',
        apiKey: 'test-key',
        retries: 5,
        debug: true,
      }),
      'utf-8'
    );
    const orig = process.env.N8N_CONFIG_FILE;
    process.env.N8N_CONFIG_FILE = configPath;
    try {
      const config = await loadConfig();
      assert(config.retries === 5, 'retries mismatch');
      assert(config.debug === true, 'debug mismatch');
    } finally {
      if (orig !== undefined) process.env.N8N_CONFIG_FILE = orig;
      else delete process.env.N8N_CONFIG_FILE;
      await rm(configPath, { force: true });
    }
  });

  return { passed, failed };
}
