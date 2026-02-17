# n8n-cli

**Manage n8n workflows and executions from the command line** – a thin, zero-fuss REST API client for [n8n](https://n8n.io).

The n8n UI is great for building workflows, but automation needs the command line: deploy from CI/CD, run workflows on a schedule, list executions, retry failures, or sync workflows across instances. Raw REST calls work for one-offs, but they repeat the same boilerplate—config, error handling, retries, TLS—in every script. n8n-cli gives you a ready-made CLI and a reusable API so you can focus on your workflows instead of HTTP plumbing. You can expect a small, dependency-light package that works with any n8n instance (cloud or self-hosted), supports multiple configs for different environments, and doubles as a library for your own deploy and test scripts.

## Why n8n-cli?

n8n’s REST API lets you upload workflows with a simple `POST`. So why use this CLI?

- **One config, many commands** – `baseUrl`, `apiKey`, and TLS options live in one config file. No env vars or hardcoded URLs in every script.
- **Deploy = create-or-update + activate** – Deploy any workflow JSON with one command. The CLI handles lookup, update, create, and activation.
- **Production-ready HTTP** – Retries, proxy support, self-signed certs, and timeouts are built in. Corporate networks and flaky connections are handled without extra code.
- **Typed operations** – List workflows, run executions, manage tags, pagination, health check – all with a simple API instead of manual `fetch` and error handling.
- **No framework lock-in** – It’s a thin wrapper, not a framework. Use it as a CLI or import `N8nClient` and `loadConfig` in your own scripts.

For a one-off upload, `curl` is enough. For repeated deploys, CI/CD, or scripts that list, run, and manage workflows across instances, n8n-cli keeps things simple and consistent.

**Compatibility with [official n8n CLI](https://docs.n8n.io/hosting/cli-commands/)** – The built-in n8n CLI runs on the server. n8n-cli is a remote REST API client. Commands that map to the official CLI: `execute` → `run`, `activate`/`deactivate`, `activate:all`/`deactivate:all`, `export`/`save:all`, `import`, `audit`.

---

## Setup

```bash
cd n8n-cli
npm install
npm run build
```

Create `config/n8n-config.local.json`:

```json
{
  "baseUrl": "https://your-n8n-instance.example.com",
  "apiKey": "your-api-key"
}
```

Or use env vars: `N8N_BASE_URL` + `N8N_API_KEY`

---

## Command Reference

| Command | Description |
|---------|-------------|
| **Build & Start** | |
| `npm run build` | Compile TypeScript |
| `npm run start` | Start interactive CLI |
| `npm run agent` | Interactive CLI (workflows + executions + overview) |
| **List** | |
| `npm run list` | List all workflows |
| `npm run list:active` | List active workflows only |
| `npm run list:inactive` | List inactive workflows only |
| `npm run search -- <name-filter>` | Filter workflows by name |
| **Run & Manage** | |
| `npm run run -- <id\|name>` | Run workflow by ID or name |
| `npm run execute -- <id\|name>` | Same as run (matches official n8n CLI) |
| `npm run get -- <id\|name>` | Get workflow JSON |
| `npm run export -- <id\|name> [file.json]` | Export workflow to file or stdout |
| `npm run save -- <id\|name> [file.json]` | Save workflow to workflows/saved/ |
| `npm run save:all [directory]` | Save all workflows |
| `npm run import -- <workflow.json> [new-name]` | Import workflow from JSON |
| `npm run activate -- <id\|name>` | Activate workflow |
| `npm run activate:all` | Activate all inactive workflows |
| `npm run deactivate -- <id\|name>` | Deactivate workflow |
| `npm run deactivate:all` | Deactivate all active workflows |
| `npm run delete -- <id\|name>` | Delete workflow |
| `npm run clone -- <id\|name> <new-name>` | Clone workflow |
| `npm run rename -- <id\|name> <new-name>` | Rename workflow |
| `npm run transfer -- <id\|name> <projectId>` | Transfer workflow to another project |
| **Executions** | |
| `npm run executions [workflowId]` | List executions |
| `npm run executions:errors [workflowId]` | List failed executions only |
| `npm run status [executionId]` | Status of executions |
| `npm run retry -- <executionId>` | Retry failed execution |
| `npm run stop -- <executionId>` | Stop running execution |
| `npm run delete-execution -- <executionId>` | Delete execution |
| **Tags & Audit** | |
| `npm run tags` | List all tags |
| `npm run tag:create -- <name>` | Create tag |
| `npm run workflow-tags -- <id\|name> [tagIds]` | Show or set workflow tags |
| `npm run audit` | Run security audit |
| **Variables & Webhooks** | |
| `npm run variables` | List instance variables |
| `npm run webhook -- <id\|name>` | Show webhook URLs (Production + Test) |
| **Config & Validation** | |
| `npm run config` | Show loaded config |
| `npm run config:endpoint -- <url>` | Set n8n URL |
| `npm run config:apikey -- <key>` | Set API key |
| `npm run config:project -- <id>` | Set project ID (optional) |
| `npm run ping` | Health check |
| `npm run credentials` | List credentials |
| `npm run validate -- <workflow.json>` | Validate workflow JSON |
| **Deploy & Diff** | |
| `npm run deploy:one -- <path>` | Deploy any workflow JSON file |
| `npm run diff -- <id\|name> <local-workflow.json>` | Compare workflow with local file |
| **Tests** | |
| `npm run test:client` | Run N8nClient integration tests |

---

## Configuration

**1. Config file** – `config/n8n-config.local.json` or `config/n8n-config.json`

**2. Env vars** (no config file):
```bash
N8N_BASE_URL=https://your-instance.n8n.cloud N8N_API_KEY=your-key npm run list
```
Optional: `N8N_PROJECT_ID`, `N8N_REJECT_UNAUTHORIZED=false`

**3. Multiple configs** – e.g. `config/n8n-config.prod.json`:
```bash
N8N_CONFIG_FILE=config/n8n-config.prod.json npm run list
```

**Quick config** (for teammates):
```bash
npm run config:endpoint -- https://your-n8n-instance.example.com
npm run config:apikey -- your-api-key
npm run config:project -- optional-project-id
```

---

## Build & Start

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run start` | Start interactive CLI |
| `npm run agent` | Interactive CLI (workflows + executions + command overview) |

---

## List Workflows

| Command | Description |
|---------|-------------|
| `npm run list` | List all workflows |
| `npm run list:active` | List only active workflows |
| `npm run list:inactive` | List only inactive workflows |
| `npm run search -- <name-filter>` | Filter workflows by name |

---

## Run & Manage Workflows

| Command | Description |
|---------|-------------|
| `npm run run -- <id\|name>` | Run workflow by ID or name |
| `npm run execute -- <id\|name>` | Same as run (matches official n8n CLI) |
| `npm run get -- <id\|name>` | Get workflow JSON |
| `npm run export -- <id\|name> [file.json]` | Export workflow to file or stdout |
| `npm run save -- <id\|name> [file.json]` | Save workflow to workflows/saved/ |
| `npm run save:all [directory]` | Save all workflows |
| `npm run import -- <workflow.json> [new-name]` | Import workflow from JSON |
| `npm run activate -- <id\|name>` | Activate workflow |
| `npm run activate:all` | Activate all inactive workflows |
| `npm run deactivate -- <id\|name>` | Deactivate workflow |
| `npm run deactivate:all` | Deactivate all active workflows |
| `npm run delete -- <id\|name>` | Delete workflow |
| `npm run clone -- <id\|name> <new-name>` | Clone workflow |
| `npm run rename -- <id\|name> <new-name>` | Rename workflow |
| `npm run transfer -- <id\|name> <projectId>` | Transfer workflow to another project |

---

## Executions

| Command | Description |
|---------|-------------|
| `npm run executions` | List executions |
| `npm run executions -- <workflowId>` | List executions for a workflow |
| `npm run executions:errors` | List failed executions only |
| `npm run executions:errors -- <workflowId>` | Failed executions for a workflow |
| `npm run status` | Status of all executions |
| `npm run status -- <executionId>` | Detailed status of one execution |
| `npm run retry -- <executionId>` | Retry failed execution |
| `npm run stop -- <executionId>` | Stop running execution |
| `npm run delete-execution -- <executionId>` | Delete execution |

---

## Tags & Audit

| Command | Description |
|---------|-------------|
| `npm run tags` | List all tags |
| `npm run tag:create -- <name>` | Create tag |
| `npm run workflow-tags -- <id\|name>` | Show tags for a workflow |
| `npm run workflow-tags -- <id\|name> <tagIds>` | Set workflow tags (comma-separated) |
| `npm run audit` | Run security audit |

---

## Variables & Webhooks

| Command | Description |
|---------|-------------|
| `npm run variables` | List instance variables |
| `npm run webhook -- <id\|name>` | Show webhook URLs (Production + Test) |

---

## Config & Validation

| Command | Description |
|---------|-------------|
| `npm run config` | Show loaded config (baseUrl, projectId, config file) |
| `npm run config:endpoint -- <url>` | Set n8n URL |
| `npm run config:apikey -- <key>` | Set API key |
| `npm run config:project -- <id>` | Set project ID (optional) |
| `npm run ping` | Health check (n8n reachable, API key valid) |
| `npm run credentials` | List credentials |
| `npm run validate -- <workflow.json>` | Validate workflow JSON |

---

## Deploy

| Command | Description |
|---------|-------------|
| `npm run deploy:one -- <path>` | Deploy any workflow JSON file |

---

## Diff

| Command | Description |
|---------|-------------|
| `npm run diff -- <id\|name> <local-workflow.json>` | Compare workflow with local file |

---

## Tests

| Command | Description |
|---------|-------------|
| `npm run test` | Run unit tests with coverage (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:client` | Run N8nClient integration tests (requires n8n instance) |

See [test/README.md](test/README.md) for documentation of implemented tests.

---

## Examples

```bash
# First steps – set config
npm run config:endpoint -- https://your-n8n-instance.example.com
npm run config:apikey -- your-api-key-from-n8n-settings
npm run ping   # test connection

# Env vars
N8N_BASE_URL=https://your-instance.n8n.cloud N8N_API_KEY=xxx npm run list

# Choose config file
N8N_CONFIG_FILE=config/n8n-config.prod.json npm run list

# Run workflow
npm run run -- my-workflow-name

# Show webhook URLs
npm run webhook -- my-workflow-name

# Validate workflow file
npm run validate -- ./my-workflow.json

# Clone workflow
npm run clone -- my-workflow "my-workflow-copy"

# Search workflows
npm run search -- agent

# Save workflow
npm run save -- "My Workflow"
npm run save:all

# Import workflow
npm run import -- ./backup.json "Imported Workflow"

# Failed executions
npm run executions:errors

# Deploy any workflow
npm run deploy:one -- ./my-workflow.json
```

---

## Install as Package

```bash
npm install -g n8n-cli
n8n list
```

Or with npx:

```bash
npx n8n-cli list
```

---

## Extending n8n-cli

n8n-cli is designed as a **thin core** that you extend with a separate package for private workflows, deploy scripts, and tests. The public package stays minimal; your private tooling lives in its own repo.

**Extension model:**

1. **Create a private package** (e.g. `my-n8n-tools`) with `n8n-cli` as a dependency.
2. **Keep config and secrets local** – `config/n8n-config.local.json` in your package (gitignored). `loadConfig` searches from `process.cwd()` upward, so when you run from your package, it finds your config.
3. **Proxy CLI commands** – Run the n8n-cli CLI from your package so it uses your config:
   ```json
   "list": "node node_modules/n8n-cli/dist/src/cli.js list",
   "list:prod": "cross-env N8N_CONFIG_FILE=config/n8n-config.prod.json node node_modules/n8n-cli/dist/src/cli.js list"
   ```
4. **Add custom scripts** – Import `loadConfig` and `N8nClient` from `n8n-cli` for deploy, backup, and webhook test scripts. Your workflows and secrets stay in your package.

See [docs/EXTENSIONS.md](docs/EXTENSIONS.md) for full examples (deploy with credentials, multi-site deploy, backup, webhook tests).

---

## Contact

**Mario Muja**  
Hamburg, Germany  
📧 mario.muja@gmail.com  
📞 +49 1520 464 14 73
