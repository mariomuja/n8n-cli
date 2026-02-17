/**
 * n8n REST API Client
 *
 * Provides loadConfig() and N8nClient for interacting with n8n via REST API.
 * Loads config from config/n8n-config.local.json (or N8N_CONFIG_FILE env var).
 * Supports: list/create/update/delete workflows, activate, run, list executions.
 * @see https://docs.n8n.io/api/
 */

export interface N8nConfig {
  baseUrl: string;
  apiKey: string;
  /** Set to true for internal/corporate instances with self-signed certs. Use with caution. */
  rejectUnauthorized?: boolean;
  /** Optional project ID to scope workflows (e.g. from /projects/YTJDvJZNATPEAMzD/workflows) */
  projectId?: string;
  /** Optional: create Header Auth credential for Hello Agent Webhook during deploy */
  webhookHeaderAuth?: {
    name: string;
    value: string;
  };
  /** Optional: Basic Auth for webhook test (username, password) */
  webhookBasicAuth?: {
    username: string;
    password: string;
  };
  /** Optional: request timeout in ms. Default: 30000. */
  timeoutMs?: number;
  /** Optional: exact webhook URL (copy from n8n Webhook node Production URL). Overrides baseUrl + /webhook/agent */
  webhookUrl?: string;
  /** Optional: per-workflow webhook URL overrides */
  webhookUrlQr?: string;
  webhookUrlJokes?: string;
  webhookUrlInvoice?: string;
  /** Optional: retry failed requests (5xx, 429, timeout, network). Default: 3. Set 0 to disable. */
  retries?: number;
  /** Optional: enable debug logging (requests, responses, retries) */
  debug?: boolean;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: string;
  retryOf?: string;
  retrySuccessId?: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  workflowData?: { name?: string };
}

export interface WorkflowListResponse {
  data: N8nWorkflow[];
  nextCursor?: string;
}

export interface ExecutionListResponse {
  data: N8nExecution[];
  nextCursor?: string;
}

const API_VERSION = 'v1';

/**
 * Load n8n config. Priority:
 * 1. Env vars: N8N_BASE_URL + N8N_API_KEY (optional: N8N_PROJECT_ID, N8N_REJECT_UNAUTHORIZED)
 * 2. Config file: N8N_CONFIG_FILE or config/n8n-config.local.json or config/n8n-config.json
 */
export async function loadConfig(): Promise<N8nConfig> {
  const baseUrl = process.env.N8N_BASE_URL?.trim();
  const apiKey = process.env.N8N_API_KEY?.trim();
  if (baseUrl && apiKey) {
    return {
      baseUrl,
      apiKey,
      projectId: process.env.N8N_PROJECT_ID?.trim() || undefined,
      rejectUnauthorized: process.env.N8N_REJECT_UNAUTHORIZED !== 'false',
    };
  }

  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const cwd = process.cwd();
  const candidates = [
    cwd,
    path.resolve(cwd, '..'),
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '..', '..'),
  ];

  const configFile = process.env.N8N_CONFIG_FILE?.trim();
  const configNames = configFile
    ? [configFile]
    : ['config/n8n-config.local.json', 'config/n8n-config.json'];

  for (const rootDir of candidates) {
    for (const name of configNames) {
      const configPath = path.isAbsolute(name) ? name : path.join(rootDir, name);
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content) as N8nConfig;
        if (!config.baseUrl || !config.apiKey) {
          throw new Error(`${name} must contain baseUrl and apiKey`);
        }
        return config;
      } catch {
        continue;
      }
    }
  }

  const hint =
    cwd.includes('n8n-tools') || cwd.includes('n8n-cli')
      ? ` Create config/n8n-config.local.json in ${path.basename(cwd)} (copy from config/n8n-config.example.json).`
      : '';
  throw new Error(
    `Failed to load n8n config. Use N8N_BASE_URL + N8N_API_KEY env vars, or create config/n8n-config.local.json with { "baseUrl": "...", "apiKey": "..." }. Use N8N_CONFIG_FILE for a specific config file.${hint}`
  );
}

/**
 * Returns a user-friendly message for API/connection errors.
 * Use in CLI catch blocks to help users fix config issues.
 */
export function toFriendlyApiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && 'cause' in err ? (err.cause as Error) : null;
  const causeMsg = cause?.message ?? '';
  const causeCode = (cause as NodeJS.ErrnoException)?.code ?? '';

  // 401 Unauthorized – invalid or missing API key
  if (msg.includes('401') || msg.includes('unauthorized')) {
    return (
      'Invalid API key. Update apiKey in your config (n8n-config.local.json or N8N_API_KEY).\n' +
      '  Create an API key in n8n: Settings → API.'
    );
  }

  // 403 Forbidden
  if (msg.includes('403') || msg.includes('forbidden')) {
    return (
      'Access denied (403). Check that your API key has the required permissions.\n' +
      '  Create or regenerate an API key in n8n: Settings → API.'
    );
  }

  // 404 – wrong URL or instance not found
  if (msg.includes('404') || msg.includes('not found')) {
    return (
      'n8n instance not found. Check baseUrl in your config (n8n-config.local.json or N8N_BASE_URL).\n' +
      '  Ensure the URL is correct and n8n is running.'
    );
  }

  // ENOTFOUND – hostname cannot be resolved
  if (causeCode === 'ENOTFOUND' || causeMsg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
    return (
      'Cannot resolve n8n hostname. Check baseUrl in your config (n8n-config.local.json or N8N_BASE_URL).\n' +
      '  Ensure the URL is correct and reachable from your network.'
    );
  }

  // ECONNREFUSED – nothing listening
  if (causeCode === 'ECONNREFUSED' || causeMsg.includes('ECONNREFUSED')) {
    return (
      'Cannot connect to n8n. Is it running? Check baseUrl in your config (n8n-config.local.json or N8N_BASE_URL).\n' +
      '  For local: start n8n with `npx n8n` (default port 5678).'
    );
  }

  // Self-signed certificate
  if (
    causeCode === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    causeMsg.includes('SELF_SIGNED_CERT') ||
    msg.includes('self-signed')
  ) {
    return (
      'Self-signed certificate rejected. For corporate/internal n8n instances:\n' +
      '  Set rejectUnauthorized: false in config, or run with NODE_TLS_REJECT_UNAUTHORIZED=0.'
    );
  }

  // Timeout
  if (msg.includes('timed out') || msg.includes('AbortError')) {
    return (
      'Request timed out. Check baseUrl and network. Increase timeoutMs in config if needed.'
    );
  }

  // Generic n8n API error – pass through with a hint
  if (msg.includes('n8n API error')) {
    return msg + '\n  Check baseUrl and apiKey in your config.';
  }

  // Fetch/network errors
  if (msg.includes('fetch failed') || causeMsg) {
    return (
      `Connection failed: ${causeMsg || msg}\n` +
      '  Check baseUrl and apiKey in your config (n8n-config.local.json or env vars).'
    );
  }

  return msg;
}

/**
 * n8n REST API client
 */
function parseApiError(status: number, text: string): Error {
  try {
    const json = JSON.parse(text) as { message?: string; error?: { message?: string } };
    const msg = json?.message ?? json?.error?.message ?? text;
    return new Error(`n8n API error ${status}: ${msg}`);
  } catch {
    return new Error(`n8n API error ${status}: ${text}`);
  }
}

function isRetryable(err: unknown, status?: number): boolean {
  if (status !== undefined) {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
  }
  const s = String(err);
  return s.includes('timed out') || s.includes('AbortError') || s.includes('ECONNRESET') || s.includes('ETIMEDOUT') || s.includes('fetch failed');
}

export class N8nClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly rejectUnauthorized: boolean;
  private readonly projectId?: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly debug: boolean;

  constructor(config: N8nConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.rejectUnauthorized = config.rejectUnauthorized ?? true;
    this.projectId = config.projectId;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.retries = config.retries ?? 3;
    this.debug = config.debug ?? false;
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.error('[n8n-client]', ...args);
    }
  }

  private getUrl(path: string): string {
    const base = `${this.baseUrl}/api/${API_VERSION}`;
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = this.getUrl(path);
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-N8N-API-KEY': this.apiKey,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const hasProxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy;

    const doRequest = async (): Promise<T> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      const fetchOptions: RequestInit & { dispatcher?: unknown } = {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      };
      if (hasProxy) {
        const { EnvHttpProxyAgent } = await import('undici');
        fetchOptions.dispatcher = new EnvHttpProxyAgent({
          connect: this.rejectUnauthorized === false ? { rejectUnauthorized: false } : undefined,
        });
      } else if (!this.rejectUnauthorized) {
        const { Agent } = await import('undici');
        fetchOptions.dispatcher = new Agent({
          connect: { rejectUnauthorized: false },
        });
      }
      try {
        this.log(`${method} ${path}`);
        const res = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);
        const text = await res.text();

        if (!res.ok) {
          throw Object.assign(parseApiError(res.status, text), { status: res.status });
        }

        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const data = text ? (JSON.parse(text) as T) : undefined;
          this.log(`${method} ${path} -> ${res.status}`);
          return data as T;
        }
        return undefined as T;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`n8n API request timed out after ${this.timeoutMs}ms`);
        }
        throw err;
      }
    };

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await doRequest();
      } catch (err) {
        lastErr = err;
        const status = (err as { status?: number })?.status;
        if (attempt < this.retries && isRetryable(err, status)) {
          const delay = Math.min(1000 * 2 ** attempt, 10000);
          this.log(`Retry ${attempt + 1}/${this.retries} in ${delay}ms:`, (err as Error).message);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          throw err;
        }
      }
    }
    throw lastErr;
  }

  async listWorkflows(active?: boolean, name?: string): Promise<N8nWorkflow[]> {
    const res = await this.listWorkflowsPaginated(active, undefined, name);
    return res?.data ?? [];
  }

  async listWorkflowsPaginated(
    active?: boolean,
    cursor?: string,
    name?: string
  ): Promise<WorkflowListResponse> {
    const params = new URLSearchParams();
    if (active !== undefined) params.set('active', String(active));
    if (cursor) params.set('cursor', cursor);
    if (name) params.set('name', name);
    const qs = params.toString() ? `?${params}` : '';
    const path = this.projectId
      ? `projects/${this.projectId}/workflows${qs}`
      : `workflows${qs}`;
    try {
      const res = await this.request<WorkflowListResponse>('GET', path);
      return res ?? { data: [] };
    } catch (err) {
      if (this.projectId && String(err).includes('404')) {
        const fallback = await this.request<WorkflowListResponse>('GET', `workflows${qs}`);
        return fallback ?? { data: [] };
      }
      throw err;
    }
  }

  async listWorkflowsAll(active?: boolean, name?: string): Promise<N8nWorkflow[]> {
    const all: N8nWorkflow[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.listWorkflowsPaginated(active, cursor, name);
      all.push(...(res.data ?? []));
      cursor = res.nextCursor;
    } while (cursor);
    return all;
  }

  async createCredential(payload: {
    name: string;
    type: string;
    data: Record<string, string>;
  }): Promise<{ id: string; name: string }> {
    const res = await this.request<{ id: string; name: string }>('POST', 'credentials', payload);
    return res as { id: string; name: string };
  }

  async listCredentials(): Promise<{ id: string; name: string; type: string }[]> {
    const res = await this.request<{ data?: { id: string; name: string; type: string }[] }>(
      'GET',
      'credentials'
    );
    return res?.data ?? [];
  }

  async createWorkflow(
    workflow: Record<string, unknown>,
    projectId?: string
  ): Promise<{ id: string; name: string }> {
    if (projectId) {
      try {
        const res = await this.request<{ id: string; name: string }>(
          'POST',
          `projects/${projectId}/workflows`,
          workflow
        );
        return res as { id: string; name: string };
      } catch (err) {
        if (String(err).includes('404') || String(err).includes('not found')) {
          const res = await this.request<{ id: string; name: string }>('POST', 'workflows', workflow);
          return res as { id: string; name: string };
        }
        throw err;
      }
    }
    const res = await this.request<{ id: string; name: string }>('POST', 'workflows', workflow);
    return res as { id: string; name: string };
  }

  async getWorkflow(id: string): Promise<N8nWorkflow> {
    const path = this.projectId ? `projects/${this.projectId}/workflows/${id}` : `workflows/${id}`;
    try {
      const res = await this.request<N8nWorkflow>('GET', path);
      return res as N8nWorkflow;
    } catch (err) {
      if (this.projectId && (String(err).includes('404') || String(err).includes('not found'))) {
        const res = await this.request<N8nWorkflow>('GET', `workflows/${id}`);
        return res as N8nWorkflow;
      }
      throw err;
    }
  }

  async renameWorkflow(id: string, newName: string): Promise<{ id: string; name: string }> {
    const w = (await this.getWorkflow(id)) as unknown as Record<string, unknown>;
    return this.updateWorkflow(id, { ...w, name: newName });
  }

  async updateWorkflow(
    id: string,
    workflow: Record<string, unknown>
  ): Promise<{ id: string; name: string }> {
    const path = this.projectId
      ? `projects/${this.projectId}/workflows/${id}`
      : `workflows/${id}`;
    try {
      const res = await this.request<{ id: string; name: string }>('PUT', path, workflow);
      return res as { id: string; name: string };
    } catch (err) {
      if (this.projectId && (String(err).includes('404') || String(err).includes('not found'))) {
        const res = await this.request<{ id: string; name: string }>(
          'PUT',
          `workflows/${id}`,
          workflow
        );
        return res as { id: string; name: string };
      }
      throw err;
    }
  }

  async deleteWorkflow(id: string): Promise<void> {
    const path = this.projectId
      ? `projects/${this.projectId}/workflows/${id}`
      : `workflows/${id}`;
    try {
      await this.request('DELETE', path);
    } catch (err) {
      if (this.projectId && (String(err).includes('404') || String(err).includes('not found'))) {
        await this.request('DELETE', `workflows/${id}`);
      } else {
        throw err;
      }
    }
  }

  async activateWorkflow(id: string): Promise<void> {
    const path = this.projectId
      ? `projects/${this.projectId}/workflows/${id}/activate`
      : `workflows/${id}/activate`;
    try {
      await this.request('POST', path, {});
    } catch (err) {
      if (this.projectId && (String(err).includes('404') || String(err).includes('not found'))) {
        await this.request('POST', `workflows/${id}/activate`, {});
      } else {
        throw err;
      }
    }
  }

  async deactivateWorkflow(id: string): Promise<void> {
    const path = this.projectId
      ? `projects/${this.projectId}/workflows/${id}/deactivate`
      : `workflows/${id}/deactivate`;
    try {
      await this.request('POST', path, {});
    } catch (err) {
      if (this.projectId && (String(err).includes('404') || String(err).includes('not found'))) {
        await this.request('POST', `workflows/${id}/deactivate`, {});
      } else {
        throw err;
      }
    }
  }

  async listExecutions(
    workflowId?: string,
    status?: 'error' | 'success' | 'running' | 'canceled' | 'waiting'
  ): Promise<N8nExecution[]> {
    const res = await this.listExecutionsPaginated(workflowId, undefined, status);
    return res?.data ?? [];
  }

  async listExecutionsPaginated(
    workflowId?: string,
    cursor?: string,
    status?: 'error' | 'success' | 'running' | 'canceled' | 'waiting'
  ): Promise<ExecutionListResponse> {
    const params = new URLSearchParams();
    if (workflowId) params.set('workflowId', workflowId);
    if (cursor) params.set('cursor', cursor);
    if (status) params.set('status', status);
    const qs = params.toString() ? `?${params}` : '';
    const res = await this.request<ExecutionListResponse>('GET', `executions${qs}`);
    return res ?? { data: [] };
  }

  async listExecutionsAll(
    workflowId?: string,
    status?: 'error' | 'success' | 'running' | 'canceled' | 'waiting'
  ): Promise<N8nExecution[]> {
    const all: N8nExecution[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.listExecutionsPaginated(workflowId, cursor, status);
      all.push(...(res.data ?? []));
      cursor = res.nextCursor;
    } while (cursor);
    return all;
  }

  async ping(): Promise<boolean> {
    try {
      await this.listWorkflowsPaginated();
      return true;
    } catch {
      return false;
    }
  }

  async getExecution(id: string): Promise<N8nExecution> {
    const res = await this.request<N8nExecution>('GET', `executions/${id}`);
    return res as N8nExecution;
  }

  async retryExecution(id: string): Promise<{ executionId: string }> {
    const res = (await this.request<unknown>('POST', `executions/${id}/retry`, {})) as Record<
      string,
      unknown
    >;
    const data = res?.data as Record<string, unknown> | undefined;
    const executionId =
      (data?.id as string) ??
      (data?.executionId as string) ??
      (res?.id as string) ??
      (res?.executionId as string) ??
      '';
    if (!executionId) throw new Error('Retry returned no execution ID');
    return { executionId };
  }

  async stopExecution(id: string): Promise<void> {
    await this.request('POST', `executions/${id}/stop`, {});
  }

  async deleteExecution(id: string): Promise<void> {
    await this.request('DELETE', `executions/${id}`);
  }

  async listTags(): Promise<{ id: string; name: string }[]> {
    const res = await this.request<{ data?: { id: string; name: string }[] } | { id: string; name: string }[]>(
      'GET',
      'tags'
    );
    if (Array.isArray(res)) return res;
    return res?.data ?? [];
  }

  async audit(options?: { daysAbandonedWorkflow?: number; categories?: string[] }): Promise<unknown> {
    return this.request('POST', 'audit', options ?? {});
  }

  async listVariables(): Promise<{ id: string; key: string }[]> {
    const res = await this.request<{ data?: { id: string; key: string }[] } | { id: string; key: string }[]>(
      'GET',
      'variables'
    );
    if (Array.isArray(res)) return res;
    return res?.data ?? [];
  }

  async createTag(name: string): Promise<{ id: string; name: string }> {
    const res = await this.request<{ id: string; name: string }>('POST', 'tags', { name });
    return res as { id: string; name: string };
  }

  async getWorkflowTags(workflowId: string): Promise<{ id: string; name: string }[]> {
    const res = await this.request<{ data?: { id: string; name: string }[] }>(
      'GET',
      `workflows/${workflowId}/tags`
    );
    return res?.data ?? [];
  }

  async updateWorkflowTags(workflowId: string, tagIds: string[]): Promise<{ id: string; name: string }[]> {
    const res = await this.request<{ data?: { id: string; name: string }[] }>(
      'PUT',
      `workflows/${workflowId}/tags`,
      { tagIds }
    );
    return res?.data ?? [];
  }

  async transferWorkflow(workflowId: string, destinationProjectId: string): Promise<void> {
    await this.request('PUT', `workflows/${workflowId}/transfer`, {
      destinationProjectId,
    });
  }

  async runWorkflow(
    workflowId: string,
    data?: Record<string, unknown>
  ): Promise<{ executionId: string }> {
    const body = data ? { data } : {};
    const runPath = `workflows/${workflowId}/run`;
    const execBody = { workflowId, ...body };

    const extractId = (res: unknown): string =>
      (res as { data?: { executionId?: string; id?: string }; id?: string })?.data?.executionId ??
      (res as { data?: { id?: string } })?.data?.id ??
      (res as { id?: string })?.id ??
      '';

    try {
      const res = await this.request<unknown>('POST', runPath, body);
      const executionId = extractId(res);
      if (executionId) return { executionId };
    } catch {
      const res = await this.request<unknown>('POST', 'executions', execBody);
      const executionId = extractId(res);
      if (executionId) return { executionId };
    }
    throw new Error(
      `Workflow run returned no execution ID. Check ${this.baseUrl}/api/v1/docs for the correct endpoint.`
    );
  }
}
