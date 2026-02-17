# n8n-cli Unit Tests

Unit tests for n8n-cli, run with [Vitest](https://vitest.dev/). No n8n instance required—all tests use mocks.

## Running Tests

```bash
npm run test          # Run once with coverage
npm run test:watch    # Watch mode with coverage
```

## Test Suites

### `toFriendlyApiError.test.ts`

Tests the `toFriendlyApiError()` helper that converts API/connection errors into user-friendly messages.

| Error type | Tests |
|------------|-------|
| **401 Unauthorized** | Invalid API key message, Settings → API hint |
| **403 Forbidden** | Access denied, permissions hint |
| **404 Not found** | Instance not found, baseUrl hint |
| **ENOTFOUND** | Cannot resolve hostname (cause, causeMsg, getaddrinfo) |
| **ECONNREFUSED** | Cannot connect, npx n8n hint |
| **Self-signed cert** | SELF_SIGNED_CERT_IN_CHAIN, rejectUnauthorized hint |
| **Timeout / AbortError** | Request timed out message |
| **Generic n8n API error** | Pass-through with config hint |
| **Fetch failed** | Connection failed with cause or message |
| **Unknown errors** | Returns message as-is |
| **Non-Error values** | Handles string errors |

### `loadConfig.test.ts`

Tests the `loadConfig()` function that loads n8n config from env vars or config files.

| Scenario | Tests |
|----------|-------|
| **Env vars** | N8N_BASE_URL + N8N_API_KEY, N8N_PROJECT_ID, N8N_REJECT_UNAUTHORIZED |
| **Config file** | N8N_CONFIG_FILE with valid config |
| **Validation** | Missing baseUrl, missing apiKey, nonexistent file |
| **Extended options** | retries, debug from config |
| **Edge cases** | Empty projectId becomes undefined |

### `n8n-client.test.ts`

Tests the `N8nClient` class with mocked `fetch`. Covers all public API methods.

| Category | Tests |
|----------|-------|
| **Workflows** | listWorkflowsPaginated, listWorkflowsAll (with active filter), createWorkflow, getWorkflow, updateWorkflow, deleteWorkflow, activateWorkflow, deactivateWorkflow, renameWorkflow, transferWorkflow |
| **Project fallback** | 404 fallback to `/workflows` when projectId fails; throw on non-404 |
| **Executions** | listExecutions, listExecutionsPaginated, listExecutionsAll, getExecution, retryExecution, stopExecution, deleteExecution |
| **Credentials** | listCredentials, createCredential |
| **Tags** | listTags, createTag, getWorkflowTags, updateWorkflowTags |
| **Variables** | listVariables (data wrapper and array response) |
| **Other** | ping, audit, runWorkflow |
| **Retries** | 429 and 500 trigger retry |
| **Errors** | API error (401), timeout (AbortError), non-JSON response |
| **Config** | debug logging (console.error), rejectUnauthorized (Agent), HTTP_PROXY (EnvHttpProxyAgent) |

## Coverage

Coverage targets (in `vitest.config.ts`):

- **Statements / Lines / Functions:** 95%
- **Branches:** 85%

Coverage is reported for `src/n8n-client.ts` only. `cli.ts` and `deploy-one.ts` are thin wrappers; integration tests are in `tests/` (run with `npm run test:client`).
