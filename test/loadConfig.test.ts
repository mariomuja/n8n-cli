import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/n8n-client.js';

describe('loadConfig', () => {
  const tmpDir = join(tmpdir(), `n8n-loadconfig-test-${Date.now()}`);
  const origEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    await mkdir(tmpDir, { recursive: true });
    origEnv.N8N_BASE_URL = process.env.N8N_BASE_URL;
    origEnv.N8N_API_KEY = process.env.N8N_API_KEY;
    origEnv.N8N_PROJECT_ID = process.env.N8N_PROJECT_ID;
    origEnv.N8N_REJECT_UNAUTHORIZED = process.env.N8N_REJECT_UNAUTHORIZED;
    origEnv.N8N_CONFIG_FILE = process.env.N8N_CONFIG_FILE;
  });

  afterEach(async () => {
    if (origEnv.N8N_BASE_URL !== undefined) process.env.N8N_BASE_URL = origEnv.N8N_BASE_URL;
    else delete process.env.N8N_BASE_URL;
    if (origEnv.N8N_API_KEY !== undefined) process.env.N8N_API_KEY = origEnv.N8N_API_KEY;
    else delete process.env.N8N_API_KEY;
    if (origEnv.N8N_PROJECT_ID !== undefined) process.env.N8N_PROJECT_ID = origEnv.N8N_PROJECT_ID;
    else delete process.env.N8N_PROJECT_ID;
    if (origEnv.N8N_REJECT_UNAUTHORIZED !== undefined)
      process.env.N8N_REJECT_UNAUTHORIZED = origEnv.N8N_REJECT_UNAUTHORIZED;
    else delete process.env.N8N_REJECT_UNAUTHORIZED;
    if (origEnv.N8N_CONFIG_FILE !== undefined) process.env.N8N_CONFIG_FILE = origEnv.N8N_CONFIG_FILE;
    else delete process.env.N8N_CONFIG_FILE;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('loads config from N8N_BASE_URL and N8N_API_KEY env vars', async () => {
    process.env.N8N_BASE_URL = 'https://env.example.com';
    process.env.N8N_API_KEY = 'env-key';
    const config = await loadConfig();
    expect(config.baseUrl).toBe('https://env.example.com');
    expect(config.apiKey).toBe('env-key');
  });

  it('loads N8N_PROJECT_ID from env when set', async () => {
    process.env.N8N_BASE_URL = 'https://env.example.com';
    process.env.N8N_API_KEY = 'env-key';
    process.env.N8N_PROJECT_ID = 'proj-123';
    const config = await loadConfig();
    expect(config.projectId).toBe('proj-123');
  });

  it('sets rejectUnauthorized false when N8N_REJECT_UNAUTHORIZED is "false"', async () => {
    process.env.N8N_BASE_URL = 'https://env.example.com';
    process.env.N8N_API_KEY = 'env-key';
    process.env.N8N_REJECT_UNAUTHORIZED = 'false';
    const config = await loadConfig();
    expect(config.rejectUnauthorized).toBe(false);
  });

  it('loads config from N8N_CONFIG_FILE when env vars not set', async () => {
    delete process.env.N8N_BASE_URL;
    delete process.env.N8N_API_KEY;
    const configPath = join(tmpDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({ baseUrl: 'https://file.example.com', apiKey: 'file-key' }),
      'utf-8'
    );
    process.env.N8N_CONFIG_FILE = configPath;
    const config = await loadConfig();
    expect(config.baseUrl).toBe('https://file.example.com');
    expect(config.apiKey).toBe('file-key');
  });

  it('throws when config file missing baseUrl', async () => {
    delete process.env.N8N_BASE_URL;
    delete process.env.N8N_API_KEY;
    const configPath = join(tmpDir, 'bad.json');
    await writeFile(configPath, JSON.stringify({ apiKey: 'x' }), 'utf-8');
    process.env.N8N_CONFIG_FILE = configPath;
    await expect(loadConfig()).rejects.toThrow(/baseUrl|apiKey/);
  });

  it('throws when config file missing apiKey', async () => {
    delete process.env.N8N_BASE_URL;
    delete process.env.N8N_API_KEY;
    const configPath = join(tmpDir, 'bad2.json');
    await writeFile(configPath, JSON.stringify({ baseUrl: 'https://x.com' }), 'utf-8');
    process.env.N8N_CONFIG_FILE = configPath;
    await expect(loadConfig()).rejects.toThrow(/baseUrl|apiKey/);
  });

  it('throws when N8N_CONFIG_FILE points to nonexistent file', async () => {
    delete process.env.N8N_BASE_URL;
    delete process.env.N8N_API_KEY;
    process.env.N8N_CONFIG_FILE = join(tmpDir, 'nonexistent.json');
    await expect(loadConfig()).rejects.toThrow();
  });

  it('loads retries and debug from config file', async () => {
    delete process.env.N8N_BASE_URL;
    delete process.env.N8N_API_KEY;
    const configPath = join(tmpDir, 'extended.json');
    await writeFile(
      configPath,
      JSON.stringify({
        baseUrl: 'https://test.com',
        apiKey: 'key',
        retries: 5,
        debug: true,
      }),
      'utf-8'
    );
    process.env.N8N_CONFIG_FILE = configPath;
    const config = await loadConfig();
    expect(config.retries).toBe(5);
    expect(config.debug).toBe(true);
  });

  it('loads config from default path when N8N_CONFIG_FILE points to dir/config', async () => {
    delete process.env.N8N_BASE_URL;
    delete process.env.N8N_API_KEY;
    const configDir = join(tmpDir, 'config');
    await mkdir(configDir, { recursive: true });
    const configPath = join(configDir, 'n8n-config.local.json');
    await writeFile(
      configPath,
      JSON.stringify({ baseUrl: 'https://default.example.com', apiKey: 'default-key' }),
      'utf-8'
    );
    process.env.N8N_CONFIG_FILE = configPath;
    const config = await loadConfig();
    expect(config.baseUrl).toBe('https://default.example.com');
    expect(config.apiKey).toBe('default-key');
  });

  it('loads projectId from env when empty string becomes undefined', async () => {
    process.env.N8N_BASE_URL = 'https://x.com';
    process.env.N8N_API_KEY = 'key';
    process.env.N8N_PROJECT_ID = '   ';
    const config = await loadConfig();
    expect(config.projectId).toBeUndefined();
  });
});
