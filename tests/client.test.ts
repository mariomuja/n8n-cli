#!/usr/bin/env node
/**
 * Integration tests for N8nClient.
 * Requires config/n8n-config.local.json with valid baseUrl and apiKey.
 * Run with: npm run test:client (from n8n-cli)
 */

import { loadConfig, N8nClient } from '../src/n8n-client.js';

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
};

const TEST_WORKFLOW_NAME = `n8n-cli-test-${Date.now()}`;

export async function runClientTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  let client: N8nClient;
  let createdWorkflowId: string | null = null;

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
  } catch (err) {
    console.error('\n--- N8nClient tests SKIPPED (no config) ---\n');
    console.error('  Create config/n8n-config.local.json with baseUrl and apiKey to run client tests.\n');
    return { passed: 0, failed: 0 };
  }

  console.log('\n--- N8nClient tests ---\n');

  await run('ping returns true when reachable', async () => {
    const ok = await client!.ping();
    assert(ok === true, 'Expected ping to return true');
  });

  await run('listWorkflows returns array', async () => {
    const workflows = await client!.listWorkflows();
    assert(Array.isArray(workflows), 'Expected array');
  });

  await run('listWorkflowsPaginated returns data and optional nextCursor', async () => {
    const res = await client!.listWorkflowsPaginated();
    assert(Array.isArray(res.data), 'Expected data array');
    assert(res.data !== undefined, 'Expected data');
  });

  await run('listWorkflowsAll returns array (all pages)', async () => {
    const workflows = await client!.listWorkflowsAll();
    assert(Array.isArray(workflows), 'Expected array');
  });

  await run('listWorkflows with active filter', async () => {
    const active = await client!.listWorkflows(true);
    const inactive = await client!.listWorkflows(false);
    assert(Array.isArray(active) && Array.isArray(inactive), 'Expected arrays');
  });

  await run('createWorkflow creates workflow', async () => {
    const minimal = {
      name: TEST_WORKFLOW_NAME,
      nodes: [
        {
          id: 'webhook-1',
          name: 'Webhook',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 2,
          position: [240, 300],
          parameters: { path: 'test', httpMethod: 'POST' },
        },
      ],
      connections: {},
    };
    const res = await client!.createWorkflow(minimal);
    assert(res.id !== undefined, 'Expected id');
    assert(res.name === TEST_WORKFLOW_NAME, 'Expected name');
    createdWorkflowId = res.id;
  });

  await run('getWorkflow returns workflow', async () => {
    const w = await client!.getWorkflow(createdWorkflowId!);
    assert(w.id === createdWorkflowId, 'Expected matching id');
    assert(w.name === TEST_WORKFLOW_NAME, 'Expected matching name');
  });

  await run('updateWorkflow updates workflow', async () => {
    const w = (await client!.getWorkflow(createdWorkflowId!)) as unknown as Record<string, unknown>;
    w.name = `${TEST_WORKFLOW_NAME}-updated`;
    const res = await client!.updateWorkflow(createdWorkflowId!, w);
    assert(res.name === `${TEST_WORKFLOW_NAME}-updated`, 'Expected updated name');
  });

  await run('listExecutions returns array', async () => {
    const executions = await client!.listExecutions();
    assert(Array.isArray(executions), 'Expected array');
  });

  await run('listCredentials returns array', async () => {
    const creds = await client!.listCredentials();
    assert(Array.isArray(creds), 'Expected array');
  });

  await run('deactivateWorkflow deactivates', async () => {
    await client!.deactivateWorkflow(createdWorkflowId!);
    const w = await client!.getWorkflow(createdWorkflowId!);
    assert(w.active === false, 'Expected inactive');
  });

  await run('activateWorkflow activates', async () => {
    await client!.activateWorkflow(createdWorkflowId!);
    const w = await client!.getWorkflow(createdWorkflowId!);
    assert(w.active === true, 'Expected active');
  });

  await run('deleteWorkflow deletes workflow', async () => {
    await client!.deleteWorkflow(createdWorkflowId!);
    createdWorkflowId = null;
  });

  return { passed, failed };
}
