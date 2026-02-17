# Extending n8n-cli

n8n-cli is designed to be extended. Add your own deploy scripts, backup tools, and webhook tests by depending on n8n-cli and using its API.

## Extension Model

1. **Create a separate package** (e.g. `my-n8n-tools`) with `n8n-cli` as a dependency
2. **Import** `loadConfig` and `N8nClient` from `n8n-cli`
3. **Add your scripts** to `package.json` and run them via npm

Your extension keeps config, workflows, and secrets in its own folder. n8n-cli provides the API; you provide the automation.

---

## Project Structure

```
my-n8n-tools/
├── package.json          # "n8n-cli": "^1.0.0"
├── config/
│   ├── n8n-config.example.json
│   └── n8n-config.local.json   # gitignored
├── workflows/
│   ├── my-agent-workflow.json
│   ├── deploy/
│   │   ├── deploy-my-agent.ts
│   │   └── deploy-all-sites.ts
│   ├── scripts/
│   │   └── backup-workflow.mjs
│   └── test/
│       └── test-my-agent.ts
└── dist/                 # compiled output
```

---

## 1. Deploy Scripts

### Simple deploy (single workflow)

Read a workflow JSON, create-or-update in n8n, activate:

```typescript
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig, N8nClient } from 'n8n-cli';

async function deploy(): Promise<void> {
  const config = await loadConfig();
  const client = new N8nClient(config);

  const path = join(process.cwd(), 'workflows', 'my-agent-workflow.json');
  const json = await readFile(path, 'utf-8');
  const workflow = JSON.parse(json) as Record<string, unknown>;

  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings ?? {},
  };

  const workflows = await client.listWorkflows();
  const existing = workflows.find((w) => w.name === workflow.name);

  if (existing) {
    await client.updateWorkflow(existing.id, payload);
    console.log(`  ✓ ${workflow.name} [updated]`);
  } else {
    const res = await client.createWorkflow(payload, config.projectId);
    console.log(`  ✓ ${res.name} [created]`);
  }

  const workflowId = existing?.id ?? (await client.listWorkflows()).find((w) => w.name === workflow.name)!.id;
  await client.activateWorkflow(workflowId);
  console.log(`  ✓ Workflow activated`);
}

deploy().catch((err) => {
  console.error('Deploy failed:', (err as Error).message);
  process.exit(1);
});
```

### Deploy with credentials and secrets

For workflows that need credentials (OAuth2, API keys), create credentials first and inject IDs into the workflow:

```typescript
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig, N8nClient } from 'n8n-cli';

async function ensureCredential(
  client: N8nClient,
  name: string,
  type: string,
  data: Record<string, string>
): Promise<string> {
  const existing = await client.listCredentials();
  const found = existing.find((c) => c.name === name);
  if (found) return found.id;
  const cred = await client.createCredential({ name, type, data });
  return cred.id;
}

async function deploy(): Promise<void> {
  const config = await loadConfig();
  const client = new N8nClient(config);

  // 1. Load secrets from a gitignored file
  const secretsPath = resolve(process.cwd(), 'workflows', 'my-agent-secrets.json');
  const secrets = JSON.parse(await readFile(secretsPath, 'utf-8'));

  // 2. Create or reuse credentials
  const apiCredId = await ensureCredential(client, 'My Agent - API', 'nexusApi', {
    apiKey: secrets.apiKey,
    endpointUrl: secrets.endpointUrl,
  });
  console.log('  ✓ API credential:', apiCredId);

  // 3. Load workflow and inject credential IDs
  const workflowPath = resolve(process.cwd(), 'workflows', 'my-agent-workflow.json');
  let workflowJson = await readFile(workflowPath, 'utf-8');
  workflowJson = workflowJson.replace(/__CREDENTIAL_ID__/g, apiCredId);

  const workflow = JSON.parse(workflowJson) as Record<string, unknown>;
  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings ?? {},
  };

  const workflows = await client.listWorkflows();
  const existing = workflows.find((w) => w.name === workflow.name);
  if (existing) {
    await client.updateWorkflow(existing.id, payload);
  } else {
    await client.createWorkflow(payload, config.projectId);
  }
  // ... activate
}
```

### Multi-site deploy

Deploy the same workflows to multiple n8n instances (e.g. cloud + company) by running deploy scripts with different config files:

```typescript
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const deployDir = join(process.cwd(), 'dist', 'workflows', 'deploy');
const scripts = ['deploy.js', 'deploy-agent.js', 'deploy-invoice.js'];

function run(script: string, configFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(deployDir, script)], {
      stdio: 'inherit',
      env: { ...process.env, N8N_CONFIG_FILE: configFile },
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

async function main(): Promise<void> {
  await run('deploy.js', 'config/n8n-config.cloud.json');
  await run('deploy.js', 'config/n8n-config.company.json');
  console.log('All workflows deployed to both sites.');
}
```

---

## 2. Backup Script

A standalone script that backs up a workflow to a JSON file. It can use its own config loader (no N8nClient) or call the n8n API directly:

```javascript
// backup-workflow.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

async function loadConfig() {
  const candidates = [process.cwd(), resolve(process.cwd(), '..')];
  const names = process.env.N8N_CONFIG_FILE
    ? [process.env.N8N_CONFIG_FILE]
    : ['config/n8n-config.local.json', 'config/n8n-config.json'];
  for (const root of candidates) {
    for (const name of names) {
      try {
        const c = JSON.parse(await readFile(resolve(root, name), 'utf-8'));
        if (c.baseUrl && c.apiKey) return c;
      } catch {}
    }
  }
  throw new Error('No n8n config found.');
}

async function request(config, method, path, body) {
  const base = config.baseUrl.replace(/\/+$/, '');
  const url = `${base}/api/v1${path.startsWith('/') ? path : '/' + path}`;
  const opts = {
    method,
    headers: { Accept: 'application/json', 'X-N8N-API-KEY': config.apiKey },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`n8n API ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const target = process.argv[2] || 'My Agent';
  const config = await loadConfig();
  const list = await request(config, 'GET', 'workflows');
  const found = list.data?.find((w) => w.id === target || w.name === target);
  if (!found) throw new Error('Workflow not found: ' + target);
  const workflow = await request(config, 'GET', `workflows/${found.id}`);
  const outDir = resolve(process.cwd(), 'workflows', 'backups');
  await mkdir(outDir, { recursive: true });
  const filename = `${target.replace(/\s+/g, '-').toLowerCase()}-backup-${new Date().toISOString().slice(0, 19)}.json`;
  await writeFile(resolve(outDir, filename), JSON.stringify(workflow, null, 2), 'utf-8');
  console.log(`  ✓ Saved to ${outDir}/${filename}`);
}
```

**package.json:**
```json
"backup": "node workflows/scripts/backup-workflow.mjs",
"backup:one": "node workflows/scripts/backup-workflow.mjs"
```

---

## 3. Webhook Test Scripts

Test your deployed webhooks by POSTing to the URL. Use `loadConfig` for the base URL and auth:

```typescript
import { fetch, Agent } from 'undici';
import { loadConfig } from 'n8n-cli';

async function main(): Promise<void> {
  const config = await loadConfig();
  const base = config.baseUrl.replace(/\/$/, '');
  const url = config.webhookUrl ?? `${base}/webhook/my-agent`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.webhookBasicAuth?.username && config.webhookBasicAuth?.password) {
    const cred = Buffer.from(
      `${config.webhookBasicAuth.username}:${config.webhookBasicAuth.password}`
    ).toString('base64');
    headers['Authorization'] = `Basic ${cred}`;
  }

  const body = JSON.stringify({ query: 'Hello' });
  const opts: Record<string, unknown> = {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(30000),
  };
  if (config.rejectUnauthorized === false) {
    opts.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  }

  const res = await fetch(url, opts);
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
}
```

**package.json:**
```json
"test:agent": "node dist/workflows/test/test-my-agent.js"
```

---

## 4. Proxying CLI Commands

Reuse n8n-cli’s CLI for generic commands. Run the CLI from your extension so config is loaded from your package directory:

```json
{
  "scripts": {
    "list": "node node_modules/n8n-cli/dist/src/cli.js list",
    "list:prod": "cross-env N8N_CONFIG_FILE=config/n8n-config.prod.json node node_modules/n8n-cli/dist/src/cli.js list",
    "run": "node node_modules/n8n-cli/dist/src/cli.js run",
    "deploy:one": "node node_modules/n8n-cli/dist/src/deploy-one.js"
  },
  "dependencies": {
    "n8n-cli": "^1.0.0"
  }
}
```

When you run `npm run list` from your extension, `process.cwd()` is your package root, so `loadConfig` finds `config/n8n-config.local.json` in your folder.

---

## 5. Config and Environment

- **Config file:** `config/n8n-config.local.json` (gitignored) or `config/n8n-config.json`
- **Env override:** `N8N_CONFIG_FILE=config/n8n-config.prod.json npm run deploy`
- **Env vars:** `N8N_BASE_URL` + `N8N_API_KEY` override config

Use different config files for different n8n instances (cloud, staging, company).

---

## Summary

| Extension type | Uses | Example |
|----------------|------|---------|
| Deploy script | `loadConfig`, `N8nClient` | Create/update workflow, create credentials, activate |
| Backup script | Config + raw fetch | Export workflow to JSON file |
| Webhook test | `loadConfig` | POST to webhook URL with auth |
| Multi-site deploy | Spawn child processes with `N8N_CONFIG_FILE` | Deploy to cloud + company |
| CLI proxy | Run n8n-cli CLI from your package | `list`, `run`, `deploy:one` |
