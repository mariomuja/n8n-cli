#!/usr/bin/env node
/**
 * n8n REST API CLI – manage workflows and executions via n8n API.
 *
 * Commands: list, run, execute, executions, status, ping, credentials, get,
 *           export, activate, activate:all, deactivate, deactivate:all, delete,
 *           retry, stop, diff.
 * Usage: npx n8n <command> [args]  or  npm run <command> -- [args]
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, N8nClient, N8nConfig, toFriendlyApiError } from './n8n-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function resolveWorkflowId(client: N8nClient, idOrName: string): Promise<string> {
  if (!idOrName) return '';
  const workflows = await client.listWorkflows();
  const byId = workflows.find((w) => w.id === idOrName);
  if (byId) return byId.id;
  const byName = workflows.find((w) => w.name === idOrName);
  return byName?.id ?? idOrName;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'interactive';

  const config = await loadConfig();
  const client = new N8nClient(config);

  switch (command) {
    case 'list':
      await listWorkflows(client);
      break;
    case 'list:active':
      await listWorkflows(client, true);
      break;
    case 'list:inactive':
      await listWorkflows(client, false);
      break;
    case 'config':
      await showConfig(config);
      break;
    case 'validate':
      await validateWorkflow(args[1]);
      break;
    case 'webhook':
      await showWebhookUrls(client, config, args[1]);
      break;
    case 'clone':
      await cloneWorkflow(client, config, args[1], args[2]);
      break;
    case 'rename':
      await renameWorkflow(client, args[1], args[2]);
      break;
    case 'search':
      await searchWorkflows(client, args[1]);
      break;
    case 'delete-execution':
      await deleteExecution(client, args[1]);
      break;
    case 'tags':
      await listTags(client);
      break;
    case 'audit':
      await runAudit(client);
      break;
    case 'import':
      await importWorkflow(client, config, args[1], args[2]);
      break;
    case 'executions:errors':
      await listExecutions(client, args[1], 'error');
      break;
    case 'variables':
      await listVariables(client);
      break;
    case 'tag:create':
      await createTag(client, args[1]);
      break;
    case 'workflow-tags':
      await workflowTags(client, args[1], args[2]);
      break;
    case 'transfer':
      await transferWorkflow(client, args[1], args[2]);
      break;
    case 'run':
    case 'execute':
      await runWorkflow(client, args[1]);
      break;
    case 'executions':
      await listExecutions(client, args[1]);
      break;
    case 'status':
      await getExecutionStatus(client, args[1]);
      break;
    case 'ping':
      await ping(client);
      break;
    case 'credentials':
      await listCredentials(client);
      break;
    case 'get':
      await getWorkflow(client, args[1]);
      break;
    case 'export':
      await exportWorkflow(client, args[1], args[2]);
      break;
    case 'save':
      await saveWorkflow(client, args[1], args[2]);
      break;
    case 'save:all':
      await saveAllWorkflows(client, args[1]);
      break;
    case 'activate':
      await activateWorkflow(client, args[1]);
      break;
    case 'activate:all':
      await activateAllWorkflows(client);
      break;
    case 'deactivate':
      await deactivateWorkflow(client, args[1]);
      break;
    case 'deactivate:all':
      await deactivateAllWorkflows(client);
      break;
    case 'delete':
      await deleteWorkflow(client, args[1]);
      break;
    case 'retry':
      await retryExecution(client, args[1]);
      break;
    case 'stop':
      await stopExecution(client, args[1]);
      break;
    case 'diff':
      await diffWorkflow(client, args[1], args[2]);
      break;
    default:
      await interactive(client);
  }
}

async function listWorkflows(
  client: N8nClient,
  activeFilter?: boolean,
  nameFilter?: string
): Promise<void> {
  const label =
    activeFilter === true ? 'active' : activeFilter === false ? 'inactive' : 'all';
  const searchLabel = nameFilter ? ` name~"${nameFilter}"` : '';
  console.log(`\n📋 Listing workflows (${label}${searchLabel})...\n`);
  const workflows = await client.listWorkflows(activeFilter, nameFilter);
  if (workflows.length === 0) {
    console.log('No workflows found.');
    return;
  }
  workflows.forEach((w) => {
    const status = w.active ? '🟢 active' : '⚪ inactive';
    console.log(`  ${w.id}  ${w.name}  ${status}`);
  });
  console.log(`\nTotal: ${workflows.length} workflow(s)\n`);
}

async function runWorkflow(client: N8nClient, workflowId?: string): Promise<void> {
  const id = await resolveWorkflowId(client, workflowId ?? '');
  if (!id) {
    console.error('Usage: npm run run -- <workflowId|name>');
    process.exit(1);
  }
  console.log(`\n▶️  Running workflow ${id}...\n`);
  try {
    const { executionId } = await client.runWorkflow(id);
    console.log(`  Execution started: ${executionId}`);
    console.log(`  Check status: npm run status -- ${executionId}\n`);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function listExecutions(
  client: N8nClient,
  workflowId?: string,
  status?: 'error' | 'success' | 'running' | 'canceled' | 'waiting'
): Promise<void> {
  const label = status ? ` (status: ${status})` : '';
  console.log(`\n📜 Listing executions${label}...\n`);
  const id = workflowId ? await resolveWorkflowId(client, workflowId) : undefined;
  const executions = await client.listExecutions(id, status);
  if (executions.length === 0) {
    console.log('No executions found.');
    return;
  }
  executions.slice(0, 20).forEach((e) => {
    const status = e.finished ? '✓ done' : '⏳ running';
    const name = e.workflowData?.name ?? e.workflowId;
    console.log(`  ${e.id}  ${name}  ${status}  ${e.startedAt}`);
  });
  if (executions.length > 20) {
    console.log(`  ... and ${executions.length - 20} more`);
  }
  console.log('');
}

async function getExecutionStatus(client: N8nClient, executionId?: string): Promise<void> {
  if (executionId) {
    console.log(`\n📊 Execution status: ${executionId}\n`);
    try {
      const exec = await client.getExecution(executionId);
      console.log(`  Finished: ${exec.finished}`);
      console.log(`  Mode: ${exec.mode}`);
      console.log(`  Started: ${exec.startedAt}`);
      if (exec.stoppedAt) console.log(`  Stopped: ${exec.stoppedAt}`);
      console.log(`  Workflow: ${exec.workflowData?.name ?? exec.workflowId}\n`);
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
    return;
  }
  console.log('\n📊 Status all executions...\n');
  try {
    const executions = await client.listExecutions();
    if (executions.length === 0) {
      console.log('No executions found.\n');
      return;
    }
    executions.slice(0, 30).forEach((e) => {
      const status = e.finished ? '✓ done' : '⏳ running';
      const name = e.workflowData?.name ?? e.workflowId;
      console.log(`  ${e.id}  ${name}  ${status}  ${e.startedAt}`);
    });
    if (executions.length > 30) {
      console.log(`  ... and ${executions.length - 30} more`);
    }
    console.log(`\n  Total: ${executions.length} execution(s)\n`);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function ping(client: N8nClient): Promise<void> {
  console.log('\n🏓 Pinging n8n...\n');
  const ok = await client.ping();
  if (ok) {
    console.log('  ✓ n8n reachable, API key valid\n');
  } else {
    console.error('  ✗ n8n not reachable or API key invalid\n');
    process.exit(1);
  }
}

async function listCredentials(client: N8nClient): Promise<void> {
  console.log('\n🔑 Listing credentials...\n');
  try {
    const creds = await client.listCredentials();
    if (creds.length === 0) {
      console.log('No credentials (or API may not support credentials endpoint).\n');
      return;
    }
    creds.forEach((c) => console.log(`  ${c.id}  ${c.name}  (${c.type})`));
    console.log(`\nTotal: ${creds.length}\n`);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('405') || msg.includes('GET method not allowed')) {
      console.log('  ⚠ Credentials API not available on this n8n instance (405).');
      console.log('  Credentials are managed in the n8n UI under Settings → Credentials.\n');
      return;
    }
    console.error('Error:', msg);
    process.exit(1);
  }
}

async function getWorkflow(client: N8nClient, idOrName?: string): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id) {
    console.error('Usage: npm run get -- <workflowId|name>');
    process.exit(1);
  }
  console.log(`\n📄 Workflow: ${id}\n`);
  try {
    const w = await client.getWorkflow(id);
    console.log(JSON.stringify(w, null, 2));
    console.log('');
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function exportWorkflow(
  client: N8nClient,
  idOrName?: string,
  outPath?: string
): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id) {
    console.error('Usage: npm run export -- <workflowId|name> [output.json]');
    process.exit(1);
  }
  try {
    const w = (await client.getWorkflow(id)) as unknown as Record<string, unknown>;
    const json = JSON.stringify(w, null, 2);
    if (outPath) {
      const abs = resolve(process.cwd(), outPath);
      await writeFile(abs, json, 'utf-8');
      console.log(`\n✓ Exported to ${abs}\n`);
    } else {
      console.log(json);
    }
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

/** Get workflows/saved directory (cwd/workflows/saved). */
function getSavedDir(): string {
  return resolve(process.cwd(), 'workflows', 'saved');
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '-').slice(0, 80);
}

async function saveWorkflow(
  client: N8nClient,
  idOrName?: string,
  outPath?: string
): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id) {
    console.error('Usage: npm run save -- <workflowId|name> [output.json]');
    process.exit(1);
  }
  try {
    const w = (await client.getWorkflow(id)) as unknown as Record<string, unknown>;
    const name = (w.name as string) ?? id;
    const savedDir = getSavedDir();
    await mkdir(savedDir, { recursive: true });

    let targetPath: string;
    if (outPath) {
      targetPath = resolve(process.cwd(), outPath);
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const base = sanitizeFilename(name);
      targetPath = resolve(savedDir, `${base}-${timestamp}.json`);
    }

    await writeFile(targetPath, JSON.stringify(w, null, 2), 'utf-8');
    console.log(`\n💾 Saved: ${name}`);
    console.log(`   → ${targetPath}\n`);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function saveAllWorkflows(client: N8nClient, outDirArg?: string): Promise<void> {
  const savedDir = outDirArg ? resolve(process.cwd(), outDirArg) : getSavedDir();
  await mkdir(savedDir, { recursive: true });

  console.log(`\n💾 Saving all workflows to ${savedDir}...\n`);
  try {
    const workflows = await client.listWorkflowsAll();
    let count = 0;
    for (const w of workflows) {
      const full = (await client.getWorkflow(w.id)) as unknown as Record<string, unknown>;
      const base = sanitizeFilename(w.name);
      const targetPath = resolve(savedDir, `${base}.json`);
      await writeFile(targetPath, JSON.stringify(full, null, 2), 'utf-8');
      console.log(`  ✓ ${w.name}`);
      count++;
    }
    console.log(`\n  Total: ${count} workflow(s) saved\n`);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function activateWorkflow(client: N8nClient, idOrName?: string): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id) {
    console.error('Usage: npm run activate -- <workflowId|name>');
    process.exit(1);
  }
  console.log(`\n🟢 Activating workflow ${id}...\n`);
  try {
    await client.activateWorkflow(id);
    console.log('  ✓ Workflow activated\n');
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function deactivateWorkflow(client: N8nClient, idOrName?: string): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id) {
    console.error('Usage: npm run deactivate -- <workflowId|name>');
    process.exit(1);
  }
  console.log(`\n⚪ Deactivating workflow ${id}...\n`);
  try {
    await client.deactivateWorkflow(id);
    console.log('  ✓ Workflow deactivated\n');
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function activateAllWorkflows(client: N8nClient): Promise<void> {
  console.log('\n🟢 Activating all workflows...\n');
  const inactive = await client.listWorkflowsAll(false);
  if (inactive.length === 0) {
    console.log('  No inactive workflows to activate.\n');
    return;
  }
  let ok = 0;
  for (const w of inactive) {
    try {
      await client.activateWorkflow(w.id);
      console.log(`  ✓ ${w.name}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${w.name}: ${(err as Error).message}`);
    }
  }
  console.log(`\n  Activated ${ok}/${inactive.length} workflow(s)\n`);
}

async function deactivateAllWorkflows(client: N8nClient): Promise<void> {
  console.log('\n⚪ Deactivating all workflows...\n');
  const active = await client.listWorkflowsAll(true);
  if (active.length === 0) {
    console.log('  No active workflows to deactivate.\n');
    return;
  }
  let ok = 0;
  for (const w of active) {
    try {
      await client.deactivateWorkflow(w.id);
      console.log(`  ✓ ${w.name}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${w.name}: ${(err as Error).message}`);
    }
  }
  console.log(`\n  Deactivated ${ok}/${active.length} workflow(s)\n`);
}

async function deleteWorkflow(client: N8nClient, idOrName?: string): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id) {
    console.error('Usage: npm run delete -- <workflowId|name>');
    process.exit(1);
  }
  console.log(`\n🗑️  Deleting workflow ${id}...\n`);
  try {
    await client.deleteWorkflow(id);
    console.log('  ✓ Workflow deleted\n');
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function retryExecution(client: N8nClient, executionId?: string): Promise<void> {
  if (!executionId) {
    console.error('Usage: npm run retry -- <executionId>');
    process.exit(1);
  }
  console.log(`\n🔄 Retrying execution ${executionId}...\n`);
  try {
    const { executionId: newId } = await client.retryExecution(executionId);
    console.log(`  ✓ Retry started: ${newId}\n`);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function stopExecution(client: N8nClient, executionId?: string): Promise<void> {
  if (!executionId) {
    console.error('Usage: npm run stop -- <executionId>');
    process.exit(1);
  }
  console.log(`\n⏹️  Stopping execution ${executionId}...\n`);
  try {
    await client.stopExecution(executionId);
    console.log('  ✓ Execution stopped\n');
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

function deepSortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepSortKeys);
  return Object.keys(obj)
    .sort()
    .reduce((acc, k) => {
      (acc as Record<string, unknown>)[k] = deepSortKeys((obj as Record<string, unknown>)[k]);
      return acc;
    }, {} as Record<string, unknown>);
}

async function diffWorkflow(
  client: N8nClient,
  idOrName?: string,
  localPath?: string
): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id) {
    console.error('Usage: npm run diff -- <workflowId|name> <local-workflow.json>');
    process.exit(1);
  }
  if (!localPath) {
    console.error('Usage: npm run diff -- <workflowId|name> <local-workflow.json>');
    console.error('  Specify path to local workflow JSON file to compare.\n');
    process.exit(1);
  }

  let localJson: Record<string, unknown>;
  try {
    const content = await readFile(resolve(process.cwd(), localPath), 'utf-8');
    localJson = JSON.parse(content) as Record<string, unknown>;
  } catch {
    console.error(`Could not read ${localPath}\n`);
    process.exit(1);
  }

  console.log(`\n📊 Comparing n8n workflow ${id} with ${localPath}...\n`);
  try {
    const remote = (await client.getWorkflow(id)) as unknown as Record<string, unknown>;
    const remoteSorted = JSON.stringify(deepSortKeys(remote), null, 2);
    const localSorted = JSON.stringify(deepSortKeys(localJson), null, 2);

    if (remoteSorted === localSorted) {
      console.log('  ✓ No differences\n');
      return;
    }

    const { execSync } = await import('node:child_process');
    try {
      const tmpRemote = resolve(process.cwd(), '.n8n-diff-remote.json');
      const tmpLocal = resolve(process.cwd(), '.n8n-diff-local.json');
      await writeFile(tmpRemote, remoteSorted, 'utf-8');
      await writeFile(tmpLocal, localSorted, 'utf-8');
      execSync(`git diff --no-index ${tmpLocal} ${tmpRemote}`, { stdio: 'inherit' });
      await import('node:fs/promises').then((fs) =>
        Promise.all([fs.unlink(tmpRemote).catch(() => {}), fs.unlink(tmpLocal).catch(() => {})])
      );
    } catch {
      console.log('  (Install git for full diff, or compare manually)\n');
      console.log('  Remote nodes count:', (remote.nodes as unknown[])?.length ?? 0);
      console.log('  Local nodes count:', (localJson.nodes as unknown[])?.length ?? 0);
      console.log('');
    }
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function showConfig(config: N8nConfig): Promise<void> {
  console.log('\n⚙️  Config\n');
  console.log('  baseUrl:', config.baseUrl);
  console.log('  projectId:', config.projectId ?? '(none)');
  const fromEnv = process.env.N8N_BASE_URL && process.env.N8N_API_KEY;
  console.log('  source:', fromEnv ? 'N8N_BASE_URL + N8N_API_KEY' : (process.env.N8N_CONFIG_FILE ?? 'config/n8n-config.local.json'));
  console.log('  timeoutMs:', config.timeoutMs ?? 30000);
  console.log('');
}

async function validateWorkflow(filePath?: string): Promise<void> {
  if (!filePath) {
    console.error('Usage: npm run validate -- <workflow.json>');
    process.exit(1);
  }
  console.log(`\n🔍 Validating ${filePath}...\n`);
  try {
    const content = await readFile(resolve(process.cwd(), filePath), 'utf-8');
    const w = JSON.parse(content) as Record<string, unknown>;
    const nodes = w.nodes as unknown[];
    const connections = w.connections as Record<string, unknown>;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      console.error('  ✗ Missing or empty nodes array');
      process.exit(1);
    }
    if (!connections || typeof connections !== 'object') {
      console.error('  ✗ Missing connections object');
      process.exit(1);
    }
    console.log('  ✓ Valid workflow JSON');
    console.log('  ✓ Nodes:', nodes.length);
    console.log('  ✓ Connections:', Object.keys(connections).length);
    console.log('');
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function showWebhookUrls(
  client: N8nClient,
  config: N8nConfig,
  idOrName?: string
): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id) {
    console.error('Usage: npm run webhook -- <workflowId|name>');
    process.exit(1);
  }
  console.log(`\n🔗 Webhook URLs for ${id}...\n`);
  try {
    const w = (await client.getWorkflow(id)) as unknown as Record<string, unknown>;
    const nodes = (w.nodes as Record<string, unknown>[]) ?? [];
    const base = config.baseUrl.replace(/\/+$/, '');
    const webhooks = nodes.filter(
      (n) => n.type === 'n8n-nodes-base.webhook' || n.type === '@n8n/n8n-nodes-base.webhook'
    );
    if (webhooks.length === 0) {
      console.log('  No webhook nodes found in this workflow.\n');
      return;
    }
    for (const node of webhooks) {
      const params = (node.parameters as Record<string, unknown>) ?? {};
      const path = (params.path as string) ?? 'webhook';
      const prodUrl = `${base}/webhook/${path}`;
      const testUrl = `${base}/webhook-test/${path}`;
      console.log(`  ${node.name as string}:`);
      console.log(`    Production: ${prodUrl}`);
      console.log(`    Test:      ${testUrl}`);
      console.log('');
    }
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function renameWorkflow(
  client: N8nClient,
  idOrName?: string,
  newName?: string
): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id || !newName) {
    console.error('Usage: npm run rename -- <workflowId|name> <new-name>');
    process.exit(1);
  }
  console.log(`\n✏️  Renaming ${id} to "${newName}"...\n`);
  try {
    const res = await client.renameWorkflow(id, newName);
    console.log(`  ✓ Renamed: ${res.name} (${res.id})\n`);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function searchWorkflows(client: N8nClient, nameFilter?: string): Promise<void> {
  if (!nameFilter) {
    console.error('Usage: npm run search -- <name-filter>');
    process.exit(1);
  }
  await listWorkflows(client, undefined, nameFilter);
}

async function deleteExecution(client: N8nClient, executionId?: string): Promise<void> {
  if (!executionId) {
    console.error('Usage: npm run delete-execution -- <executionId>');
    process.exit(1);
  }
  console.log(`\n🗑️  Deleting execution ${executionId}...\n`);
  try {
    await client.deleteExecution(executionId);
    console.log('  ✓ Execution deleted\n');
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function listTags(client: N8nClient): Promise<void> {
  console.log('\n🏷️  Listing tags...\n');
  try {
    const tags = await client.listTags();
    if (tags.length === 0) {
      console.log('No tags found.\n');
      return;
    }
    tags.forEach((t) => console.log(`  ${t.id}  ${t.name}`));
    console.log(`\nTotal: ${tags.length}\n`);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function runAudit(client: N8nClient): Promise<void> {
  console.log('\n🔒 Running security audit...\n');
  try {
    const result = await client.audit();
    console.log(JSON.stringify(result, null, 2));
    console.log('');
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function importWorkflow(
  client: N8nClient,
  config: N8nConfig,
  filePath?: string,
  nameOverride?: string
): Promise<void> {
  if (!filePath) {
    console.error('Usage: npm run import -- <workflow.json> [new-name]');
    process.exit(1);
  }
  console.log(`\n📥 Importing workflow from ${filePath}...\n`);
  try {
    const content = await readFile(resolve(process.cwd(), filePath), 'utf-8');
    const w = JSON.parse(content) as Record<string, unknown>;
    if (nameOverride) w.name = nameOverride;
    delete w.id;
    delete w.updatedAt;
    delete w.createdAt;
    const created = await client.createWorkflow(w, config.projectId);
    console.log(`  ✓ Imported: ${created.name} (${created.id})\n`);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function listVariables(client: N8nClient): Promise<void> {
  console.log('\n📦 Listing variables...\n');
  try {
    const vars = await client.listVariables();
    if (vars.length === 0) {
      console.log('No variables found.\n');
      return;
    }
    vars.forEach((v) => console.log(`  ${v.id}  ${v.key}`));
    console.log(`\nTotal: ${vars.length}\n`);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('403') && msg.includes('feat:variables')) {
      console.log('  ⚠ Variables API not available (Premium feature).\n');
      return;
    }
    console.error('Error:', msg);
    process.exit(1);
  }
}

async function createTag(client: N8nClient, name?: string): Promise<void> {
  if (!name) {
    console.error('Usage: npm run tag:create -- <tag-name>');
    process.exit(1);
  }
  console.log(`\n🏷️  Creating tag "${name}"...\n`);
  try {
    const tag = await client.createTag(name);
    console.log(`  ✓ Created: ${tag.name} (${tag.id})\n`);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function workflowTags(
  client: N8nClient,
  idOrName?: string,
  tagIdsArg?: string
): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id) {
    console.error('Usage: npm run workflow-tags -- <workflowId|name> [tagIds comma-separated]');
    process.exit(1);
  }
  if (tagIdsArg) {
    const tagIds = tagIdsArg.split(',').map((s) => s.trim()).filter(Boolean);
    console.log(`\n🏷️  Updating tags for ${id}...\n`);
    try {
      const tags = await client.updateWorkflowTags(id, tagIds);
      console.log('  ✓ Tags:', tags.map((t) => t.name).join(', '));
      console.log('');
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  } else {
    console.log(`\n🏷️  Tags for workflow ${id}...\n`);
    try {
      const tags = await client.getWorkflowTags(id);
      if (tags.length === 0) {
        console.log('  No tags.\n');
        return;
      }
      tags.forEach((t) => console.log(`  ${t.id}  ${t.name}`));
      console.log('');
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  }
}

async function transferWorkflow(
  client: N8nClient,
  idOrName?: string,
  destinationProjectId?: string
): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id || !destinationProjectId) {
    console.error('Usage: npm run transfer -- <workflowId|name> <destinationProjectId>');
    process.exit(1);
  }
  console.log(`\n📤 Transferring ${id} to project ${destinationProjectId}...\n`);
  try {
    await client.transferWorkflow(id, destinationProjectId);
    console.log('  ✓ Workflow transferred\n');
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function cloneWorkflow(
  client: N8nClient,
  config: N8nConfig,
  idOrName?: string,
  newName?: string
): Promise<void> {
  const id = await resolveWorkflowId(client, idOrName ?? '');
  if (!id || !newName) {
    console.error('Usage: npm run clone -- <workflowId|name> <new-name>');
    process.exit(1);
  }
  console.log(`\n📋 Cloning ${id} to "${newName}"...\n`);
  try {
    const w = (await client.getWorkflow(id)) as unknown as Record<string, unknown>;
    const clone = JSON.parse(JSON.stringify(w)) as Record<string, unknown>;
    delete clone.id;
    delete clone.updatedAt;
    delete clone.createdAt;
    clone.name = newName;
    const nodes = (clone.nodes as Record<string, unknown>[]) ?? [];
    for (const node of nodes) {
      node.id = `node-${Math.random().toString(36).slice(2, 11)}`;
    }
    const created = await client.createWorkflow(clone, config.projectId);
    console.log(`  ✓ Created: ${created.name} (${created.id})\n`);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

async function interactive(client: N8nClient): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  n8n REST API CLI');
  console.log('═══════════════════════════════════════════════════\n');

  await listWorkflows(client);
  await listExecutions(client);

  console.log('Commands:');
  console.log('  npm run list / list:active / list:inactive - List workflows');
  console.log('  npm run search -- <name> - Search workflows by name');
  console.log('  npm run config       - Show loaded config');
  console.log('  npm run run -- <id>  - Run workflow');
  console.log('  npm run executions   - List executions');
  console.log('  npm run status       - Status of all executions');
  console.log('  npm run status -- <execId> - Detailed execution status');
  console.log('  npm run ping         - Health check');
  console.log('  npm run credentials  - List credentials');
  console.log('  npm run tags         - List tags');
  console.log('  npm run audit        - Security audit');
  console.log('  npm run get -- <id>  - Get workflow JSON');
  console.log('  npm run export -- <id> [file] - Export workflow');
  console.log('  npm run save -- <id> [file] - Save workflow to workflows/saved/');
  console.log('  npm run save:all [dir] - Save all workflows');
  console.log('  npm run webhook -- <id> - Show webhook URLs');
  console.log('  npm run activate -- <id>  - Activate workflow');
  console.log('  npm run deactivate -- <id> - Deactivate workflow');
  console.log('  npm run delete -- <id> - Delete workflow');
  console.log('  npm run rename -- <id> <new-name> - Rename workflow');
  console.log('  npm run clone -- <id> <new-name> - Clone workflow');
  console.log('  npm run retry -- <execId> - Retry execution');
  console.log('  npm run stop -- <execId> - Stop execution');
  console.log('  npm run delete-execution -- <execId> - Delete execution');
  console.log('  npm run executions:errors - List failed executions');
  console.log('  npm run import -- <file> [name] - Import workflow from JSON');
  console.log('  npm run variables - List instance variables');
  console.log('  npm run tag:create -- <name> - Create tag');
  console.log('  npm run workflow-tags -- <id> [tagIds] - Get/update workflow tags');
  console.log('  npm run transfer -- <id> <projectId> - Transfer workflow to project');
  console.log('  npm run diff -- <id> <file> - Compare with local workflow file');
  console.log('  npm run validate -- <file> - Validate workflow JSON');
  console.log('  npm run deploy:one -- <path> - Deploy any workflow JSON');
  console.log('');
}

main().catch((err) => {
  console.error(toFriendlyApiError(err));
  process.exit(1);
});
