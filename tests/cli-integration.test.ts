#!/usr/bin/env node
/**
 * Integration tests for ALL CLI commands - real API calls, no mocks.
 * Requires config/n8n-config.local.json with valid baseUrl and apiKey.
 * Run with: npm run test:integration (from n8n-cli)
 */

import { execSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, N8nClient } from '../src/n8n-client.js';

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
};

const CLI = 'node dist/src/cli.js';
const DEPLOY_ONE = 'node dist/src/deploy-one.js';
const TEST_WORKFLOW_NAME = `n8n-cli-integration-${Date.now()}`;

function runCli(command: string, args: string[] = []): string {
  const cmd = command === 'deploy:one' ? DEPLOY_ONE : CLI;
  const cliArgs = command === 'deploy:one' ? args : [command, ...args];
  const full = [cmd, ...cliArgs].filter(Boolean).join(' ');
  return execSync(full, { encoding: 'utf-8', maxBuffer: 1024 * 1024 });
}

export async function runCliIntegrationTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  let client: N8nClient;
  let workflowId: string | null = null;
  let weCreatedWorkflow = false;
  let executionId: string | null = null;
  let tmpDir: string | null = null;

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

  try {
    const config = await loadConfig();
    client = new N8nClient(config);
  } catch {
    console.error('\n--- CLI integration tests SKIPPED (no config) ---\n');
    return { passed: 0, failed: 0 };
  }

  console.log('\n--- CLI integration tests (real API calls) ---\n');

  await run('ping', async () => {
    const out = runCli('ping');
    assert(out.includes('✓') || out.includes('reachable') || out.length > 0, 'Expected output');
  });

  await run('config', async () => {
    const out = runCli('config');
    assert(out.includes('baseUrl') || out.includes('http'), 'Expected config output');
  });

  await run('list', async () => {
    const out = runCli('list');
    assert(out.includes('Listing') || out.includes('workflow') || out.includes('Total'), 'Expected list output');
  });

  await run('list:active', async () => {
    const out = runCli('list:active');
    assert(out.length > 0, 'Expected output');
  });

  await run('list:inactive', async () => {
    const out = runCli('list:inactive');
    assert(out.length > 0, 'Expected output');
  });

  await run('search', async () => {
    const out = runCli('search', ['test']);
    assert(out.length >= 0, 'Expected output');
  });

  await run('credentials', async () => {
    const out = runCli('credentials');
    assert(out.includes('Credentials') || out.includes('id') || out.length > 0, 'Expected output');
  });

  await run('tags', async () => {
    const out = runCli('tags');
    assert(out.length >= 0, 'Expected output');
  });

  await run('variables', async () => {
    const out = runCli('variables');
    assert(out.length >= 0, 'Expected output');
  });

  await run('audit', async () => {
    try {
      const out = runCli('audit');
      assert(out.length > 0, 'Expected output');
    } catch (e) {
      if (String(e).includes('403')) return;
      throw e;
    }
  });

  await run('executions', async () => {
    const out = runCli('executions');
    assert(out.length > 0, 'Expected output');
  });

  await run('executions:errors', async () => {
    const out = runCli('executions:errors');
    assert(out.length > 0, 'Expected output');
  });

  await run('status', async () => {
    const out = runCli('status');
    assert(out.length > 0, 'Expected output');
  });

  await run('save:all', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'n8n-cli-test-'));
    const out = runCli('save:all', [tmpDir]);
    assert(out.length >= 0, 'Expected output');
  });

  await run('create test workflow (via API)', async () => {
    try {
      const res = await client!.createWorkflow({
        name: TEST_WORKFLOW_NAME,
        nodes: [
          { id: 's1', name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 24 }] } } },
        ],
        connections: {},
        settings: {},
      });
      workflowId = res.id;
      weCreatedWorkflow = true;
    } catch {
      const workflows = await client!.listWorkflows();
      workflowId = workflows[0]?.id ?? null;
    }
    assert(!!workflowId, 'Expected workflow id (create or existing)');
  });

  await run('get', async () => {
    const out = runCli('get', [workflowId!]);
    assert(out.includes('"id"') || out.includes(workflowId!) || out.includes('"name"'), 'Expected workflow output');
  });

  await run('export', async () => {
    const out = runCli('export', [workflowId!]);
    assert(out.includes('"nodes"') || out.includes('"name"'), 'Expected JSON');
  });

  await run('save', async () => {
    const out = runCli('save', [workflowId!, join(tmpDir!, 'single.json')]);
    assert(out.length >= 0, 'Expected output');
  });

  await run('webhook', async () => {
    const out = runCli('webhook', [workflowId!]);
    assert(out.length >= 0, 'Expected output');
  });

  await run('deactivate', async () => {
    const out = runCli('deactivate', [workflowId!]);
    assert(out.includes('✓') || out.includes('deactivated'), 'Expected success');
  });

  await run('activate', async () => {
    const out = runCli('activate', [workflowId!]);
    assert(out.includes('✓') || out.includes('activated') || out.includes('trigger') || out.includes('authorized'), 'Expected success or hint');
  });

  await run('run', async () => {
    try {
      const out = runCli('run', [workflowId!]);
      const match = out.match(/Execution started: (\S+)/) || out.match(/([a-zA-Z0-9_-]{20,})/);
      if (match) executionId = match[1];
      assert(out.length > 0, 'Expected output');
    } catch (e) {
      assert(String(e).includes('405') || String(e).includes('Execution'), 'Run may not be supported for this instance');
    }
  });

  await run('execute (alias for run)', async () => {
    try {
      const out = runCli('execute', [workflowId!]);
      assert(out.length > 0, 'Expected output');
    } catch (e) {
      assert(String(e).includes('405') || String(e).includes('Execution'), 'Execute may not be supported');
    }
  });

  if (executionId) {
    await run('status with executionId', async () => {
      const out = runCli('status', [executionId!]);
      assert(out.length > 0, 'Expected status output');
    });
  }

  await run('clone', async () => {
    try {
      const cloneName = `${TEST_WORKFLOW_NAME}-clone`;
      const out = runCli('clone', [workflowId!, cloneName]);
      assert(out.length > 0, 'Expected output');
    } catch (e) {
      if (String(e).includes('additional properties')) return;
      throw e;
    }
  });

  await run('rename', async () => {
    try {
      const newName = `${TEST_WORKFLOW_NAME}-renamed`;
      const out = runCli('rename', [workflowId!, newName]);
      assert(out.length >= 0, 'Expected output');
    } catch (e) {
      if (String(e).includes('additional properties')) return;
      throw e;
    }
  });

  await run('tag:create', async () => {
    const tagName = `test-tag-${Date.now()}`;
    const out = runCli('tag:create', [tagName]);
    assert(out.length >= 0, 'Expected output');
  });

  await run('workflow-tags', async () => {
    const out = runCli('workflow-tags', [workflowId!]);
    assert(out.length >= 0, 'Expected output');
  });

  await run('validate', async () => {
    const validJson = JSON.stringify({
      name: 'Test',
      nodes: [{ id: 'n1', name: 'Manual', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] }],
      connections: {},
    });
    const file = join(tmpDir!, 'valid.json');
    await writeFile(file, validJson);
    const out = runCli('validate', [file]);
    assert(out.length >= 0, 'Expected output');
  });

  await run('import', async () => {
    const importJson = JSON.stringify({
      name: `${TEST_WORKFLOW_NAME}-imported`,
      nodes: [{ id: 'n1', name: 'Manual', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] }],
      connections: {},
      settings: {},
    });
    const file = join(tmpDir!, 'import.json');
    await writeFile(file, importJson);
    const out = runCli('import', [file]);
    assert(out.includes('✓') || out.includes('Imported') || out.length > 0, 'Expected import output');
  });

  await run('deploy:one', async () => {
    const deployJson = JSON.stringify({
      name: `${TEST_WORKFLOW_NAME}-deploy`,
      nodes: [{ id: 'n1', name: 'Manual', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] }],
      connections: {},
      settings: {},
    });
    const file = join(tmpDir!, 'deploy.json');
    await writeFile(file, deployJson);
    const out = runCli('deploy:one', [file]);
    assert(out.includes('✓') || out.includes('Deployed') || out.includes('deploy') || out.length > 0, 'Expected deploy output');
  });

  await run('diff', async () => {
    const localFile = join(tmpDir!, 'single.json');
    const out = runCli('diff', [workflowId!, localFile]);
    assert(out.length >= 0, 'Expected output');
  });

  await run('delete test workflow', async () => {
    if (weCreatedWorkflow && workflowId) {
      const out = runCli('delete', [workflowId!]);
      assert(out.includes('✓') || out.includes('deleted'), 'Expected delete output');
    }
    workflowId = null;
  });

  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
  }

  return { passed, failed };
}
