#!/usr/bin/env node
/**
 * Deploy any workflow JSON file to n8n.
 *
 * Usage: node deploy-one.js <workflow-path>
 *   workflow-path: path to workflow JSON (relative to cwd or absolute)
 *
 * Example:
 *   npx n8n deploy:one ./my-workflow.json
 *
 * Config: N8N_CONFIG_FILE or config/n8n-config.local.json
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig, N8nClient, toFriendlyApiError } from './n8n-client.js';

async function deploy(): Promise<void> {
  const workflowPath = process.argv[2];
  if (!workflowPath) {
    console.error('Usage: node deploy-one.js <workflow-path>');
    console.error('Example: node deploy-one.js ./my-workflow.json');
    process.exit(1);
  }

  const absPath = resolve(process.cwd(), workflowPath);
  const json = await readFile(absPath, 'utf-8');
  const workflow = JSON.parse(json) as Record<string, unknown>;
  const name = (workflow.name as string) ?? 'Unnamed Workflow';

  const payload: Record<string, unknown> = {
    name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings ?? {},
  };

  const config = await loadConfig();
  const client = new N8nClient(config);
  const baseUrl = config.baseUrl.replace(/\/*$/, '');

  console.log(`\nDeploying ${name} to ${baseUrl}...\n`);

  const workflows = await client.listWorkflows();
  const existing = workflows.find((w) => w.name === name);
  let workflowId: string;

  if (existing) {
    await client.updateWorkflow(existing.id, payload);
    workflowId = existing.id;
    console.log(`  ✓ ${name} (ID: ${workflowId}) [updated]`);
  } else {
    const res = await client.createWorkflow(payload, config.projectId);
    workflowId = res.id;
    console.log(`  ✓ ${res.name} (ID: ${workflowId}) [created]`);
  }

  try {
    await client.activateWorkflow(workflowId);
    console.log(`  ✓ Workflow activated`);
  } catch (err) {
    console.warn(`  ⚠ Could not activate: ${(err as Error).message}. Activate manually in n8n.`);
  }

  console.log('\n  Deployed successfully!\n');
}

deploy().catch((err) => {
  console.error('Deploy failed:', toFriendlyApiError(err));
  process.exit(1);
});
