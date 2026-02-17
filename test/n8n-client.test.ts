import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { N8nClient } from '../src/n8n-client.js';

const mockFetch = vi.fn();

describe('N8nClient', () => {
  const config = {
    baseUrl: 'https://test.n8n.example.com',
    apiKey: 'test-api-key',
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('constructs with config and normalizes baseUrl', () => {
    const client = new N8nClient({ ...config, baseUrl: 'https://test.com/' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"data":[]}'),
      headers: { get: () => 'application/json' },
    });
    void client.listWorkflows();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://test.com/api/v1/workflows'),
      expect.any(Object)
    );
  });

  it('listWorkflowsPaginated returns data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: [{ id: '1', name: 'W1', active: true }] })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const res = await client.listWorkflowsPaginated();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].name).toBe('W1');
  });

  it('listWorkflowsPaginated with projectId uses project path', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"data":[]}'),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient({ ...config, projectId: 'proj-1' });
    await client.listWorkflowsPaginated();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('projects/proj-1/workflows'),
      expect.any(Object)
    );
  });

  it('listWorkflowsPaginated falls back to workflows on 404 with projectId', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('n8n API error 404: not found'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"data":[]}'),
        headers: { get: () => 'application/json' },
      });
    const client = new N8nClient({ ...config, projectId: 'proj-1' });
    const res = await client.listWorkflowsPaginated();
    expect(res.data).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('listWorkflowsPaginated with active filter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"data":[]}'),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await client.listWorkflowsPaginated(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('active=true'),
      expect.any(Object)
    );
  });

  it('listWorkflowsPaginated with name filter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"data":[]}'),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await client.listWorkflowsPaginated(undefined, undefined, 'my-workflow');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('name=my-workflow'),
      expect.any(Object)
    );
  });

  it('listWorkflowsAll paginates until no nextCursor', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({ data: [{ id: '1', name: 'W1', active: true }], nextCursor: 'c1' })
          ),
        headers: { get: () => 'application/json' },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({ data: [{ id: '2', name: 'W2', active: false }], nextCursor: undefined })
          ),
        headers: { get: () => 'application/json' },
      });
    const client = new N8nClient(config);
    const all = await client.listWorkflowsAll();
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe('W1');
    expect(all[1].name).toBe('W2');
  });

  it('createWorkflow posts to workflows', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'new-1', name: 'New Workflow' })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const res = await client.createWorkflow({
      name: 'New Workflow',
      nodes: [],
      connections: {},
    });
    expect(res.id).toBe('new-1');
    expect(res.name).toBe('New Workflow');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/workflows'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      })
    );
  });

  it('createWorkflow with projectId uses project path', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'new-1', name: 'W' })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await client.createWorkflow(
      { name: 'W', nodes: [], connections: {} },
      'proj-1'
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('projects/proj-1/workflows'),
      expect.any(Object)
    );
  });

  it('createWorkflow throws when non-404 with projectId', async () => {
    mockFetch.mockRejectedValueOnce(new Error('500 Internal Server Error'));
    const client = new N8nClient({ ...config, projectId: 'p1' });
    await expect(
      client.createWorkflow({ name: 'W', nodes: [], connections: {} }, 'p1')
    ).rejects.toThrow('500');
  });

  it('createWorkflow falls back to workflows on 404 with projectId', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('404 not found'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ id: 'new-1', name: 'W' })),
        headers: { get: () => 'application/json' },
      });
    const client = new N8nClient(config);
    const res = await client.createWorkflow(
      { name: 'W', nodes: [], connections: {} },
      'proj-1'
    );
    expect(res.id).toBe('new-1');
  });

  it('getWorkflow returns workflow', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ id: 'w1', name: 'My Workflow', active: true })
        ),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const w = await client.getWorkflow('w1');
    expect(w.id).toBe('w1');
    expect(w.name).toBe('My Workflow');
  });

  it('getWorkflow throws when non-404 with projectId', async () => {
    mockFetch.mockRejectedValueOnce(new Error('500'));
    const client = new N8nClient({ ...config, projectId: 'p1' });
    await expect(client.getWorkflow('w1')).rejects.toThrow('500');
  });

  it('getWorkflow falls back on 404 with projectId', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ id: 'w1', name: 'W', active: false })),
        headers: { get: () => 'application/json' },
      });
    const client = new N8nClient({ ...config, projectId: 'p1' });
    const w = await client.getWorkflow('w1');
    expect(w.id).toBe('w1');
  });

  it('updateWorkflow puts to workflow path', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'w1', name: 'W-Updated', active: true })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const res = await client.updateWorkflow('w1', {
      id: 'w1',
      name: 'W-Updated',
      active: true,
      nodes: [],
      connections: {},
    });
    expect(res.name).toBe('W-Updated');
  });

  it('deleteWorkflow sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await client.deleteWorkflow('w1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/workflows/w1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('activateWorkflow sends POST to activate', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await client.activateWorkflow('w1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/workflows/w1/activate'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('deactivateWorkflow sends POST to deactivate', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await client.deactivateWorkflow('w1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/workflows/w1/deactivate'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('ping returns true when listWorkflowsPaginated succeeds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"data":[]}'),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const ok = await client.ping();
    expect(ok).toBe(true);
  });

  it('ping returns false when request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const client = new N8nClient(config);
    const ok = await client.ping();
    expect(ok).toBe(false);
  });

  it('listExecutions returns array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ data: [{ id: 'e1', finished: true, mode: 'manual', startedAt: 'x', workflowId: 'w1' }] })
        ),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const execs = await client.listExecutions();
    expect(execs).toHaveLength(1);
    expect(execs[0].id).toBe('e1');
  });

  it('listExecutions with workflowId and status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"data":[]}'),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await client.listExecutions('w1', 'error');
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('workflowId=w1');
    expect(callUrl).toContain('status=error');
  });

  it('listCredentials returns array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ data: [{ id: 'c1', name: 'Cred', type: 'nexusApi' }] })
        ),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const creds = await client.listCredentials();
    expect(creds).toHaveLength(1);
    expect(creds[0].name).toBe('Cred');
  });

  it('createCredential posts credential', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'cred-1', name: 'My Cred' })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const res = await client.createCredential({
      name: 'My Cred',
      type: 'nexusApi',
      data: { apiKey: 'x', endpointUrl: 'https://x.com' },
    });
    expect(res.id).toBe('cred-1');
  });

  it('listTags returns array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: [{ id: 't1', name: 'tag1' }] })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const tags = await client.listTags();
    expect(tags).toHaveLength(1);
  });

  it('listTags handles array response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify([{ id: 't1', name: 'tag1' }])),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const tags = await client.listTags();
    expect(tags).toHaveLength(1);
  });

  it('listVariables returns array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: [{ id: 'v1', key: 'KEY1' }] })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const vars = await client.listVariables();
    expect(vars).toHaveLength(1);
  });

  it('audit posts to audit endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await client.audit({ daysAbandonedWorkflow: 30 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/audit'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('30'),
      })
    );
  });

  it('renameWorkflow gets then updates', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ id: 'w1', name: 'Old', active: true, nodes: [], connections: {} })),
        headers: { get: () => 'application/json' },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ id: 'w1', name: 'New Name' })),
        headers: { get: () => 'application/json' },
      });
    const client = new N8nClient(config);
    const res = await client.renameWorkflow('w1', 'New Name');
    expect(res.name).toBe('New Name');
  });

  it('runWorkflow returns executionId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: { executionId: 'exec-1' } })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const res = await client.runWorkflow('w1');
    expect(res.executionId).toBe('exec-1');
  });

  it('runWorkflow falls back to executions endpoint', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: { id: 'exec-2' } })),
        headers: { get: () => 'application/json' },
      });
    const client = new N8nClient(config);
    const res = await client.runWorkflow('w1');
    expect(res.executionId).toBe('exec-2');
  });

  it('retryExecution returns executionId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: { id: 'exec-retry' } })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const res = await client.retryExecution('e1');
    expect(res.executionId).toBe('exec-retry');
  });

  it('transferWorkflow puts to transfer', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await client.transferWorkflow('w1', 'proj-dest');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/workflows/w1/transfer'),
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('proj-dest'),
      })
    );
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ message: 'unauthorized' })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await expect(client.listWorkflows()).rejects.toThrow(/401|unauthorized/);
  });

  it('updateWorkflow throws when non-404 with projectId', async () => {
    mockFetch.mockRejectedValueOnce(new Error('403'));
    const client = new N8nClient({ ...config, projectId: 'p1' });
    await expect(
      client.updateWorkflow('w1', { name: 'X', nodes: [], connections: {} })
    ).rejects.toThrow('403');
  });

  it('updateWorkflow falls back on 404 with projectId', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ id: 'w1', name: 'Updated' })),
        headers: { get: () => 'application/json' },
      });
    const client = new N8nClient({ ...config, projectId: 'p1' });
    const res = await client.updateWorkflow('w1', { name: 'Updated', nodes: [], connections: {} });
    expect(res.name).toBe('Updated');
  });

  it('deleteWorkflow throws when non-404 with projectId', async () => {
    mockFetch.mockRejectedValueOnce(new Error('500'));
    const client = new N8nClient({ ...config, projectId: 'p1' });
    await expect(client.deleteWorkflow('w1')).rejects.toThrow('500');
  });

  it('deleteWorkflow falls back on 404 with projectId', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('404 not found'))
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(''), headers: { get: () => '' } });
    const client = new N8nClient({ ...config, projectId: 'p1' });
    await client.deleteWorkflow('w1');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('activateWorkflow falls back on 404 with projectId', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('{}'), headers: { get: () => 'application/json' } });
    const client = new N8nClient({ ...config, projectId: 'p1' });
    await client.activateWorkflow('w1');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('deactivateWorkflow falls back on 404 with projectId', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('{}'), headers: { get: () => 'application/json' } });
    const client = new N8nClient({ ...config, projectId: 'p1' });
    await client.deactivateWorkflow('w1');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('getWorkflowTags returns tags', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: [{ id: 't1', name: 'tag1' }] })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const tags = await client.getWorkflowTags('w1');
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('tag1');
  });

  it('updateWorkflowTags puts tagIds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: [{ id: 't1', name: 'tag1' }] })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const tags = await client.updateWorkflowTags('w1', ['t1']);
    expect(tags).toHaveLength(1);
  });

  it('listVariables handles array response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify([{ id: 'v1', key: 'KEY1' }])),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const vars = await client.listVariables();
    expect(vars).toHaveLength(1);
  });

  it('getExecution returns execution', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ id: 'e1', finished: true, mode: 'manual', startedAt: 'x', workflowId: 'w1' })
        ),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const exec = await client.getExecution('e1');
    expect(exec.id).toBe('e1');
  });

  it('stopExecution posts to stop', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await client.stopExecution('e1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/executions/e1/stop'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('deleteExecution sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await client.deleteExecution('e1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/executions/e1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('createTag posts tag', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'tag-1', name: 'my-tag' })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const res = await client.createTag('my-tag');
    expect(res.id).toBe('tag-1');
    expect(res.name).toBe('my-tag');
  });

  it('activateWorkflow throws when non-404 with projectId', async () => {
    mockFetch.mockRejectedValueOnce(new Error('500 Internal Server Error'));
    const client = new N8nClient({ ...config, projectId: 'p1' });
    await expect(client.activateWorkflow('w1')).rejects.toThrow('500');
  });

  it('deactivateWorkflow throws when non-404 with projectId', async () => {
    mockFetch.mockRejectedValueOnce(new Error('403 Forbidden'));
    const client = new N8nClient({ ...config, projectId: 'p1' });
    await expect(client.deactivateWorkflow('w1')).rejects.toThrow('403');
  });

  it('retryExecution extracts executionId from res.executionId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ executionId: 'exec-from-root' })),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    const res = await client.retryExecution('e1');
    expect(res.executionId).toBe('exec-from-root');
  });

  it('retryExecution throws when no executionId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({})),
      headers: { get: () => 'application/json' },
    });
    const client = new N8nClient(config);
    await expect(client.retryExecution('e1')).rejects.toThrow('no execution ID');
  });

  it('runWorkflow throws when no executionId returned', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('{}'), headers: { get: () => 'application/json' } })
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('{}'), headers: { get: () => 'application/json' } });
    const client = new N8nClient(config);
    await expect(client.runWorkflow('w1')).rejects.toThrow('no execution ID');
  });

  it('listExecutionsAll paginates', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              data: [{ id: 'e1', finished: true, mode: 'm', startedAt: 'x', workflowId: 'w1' }],
              nextCursor: 'c1',
            })
          ),
        headers: { get: () => 'application/json' },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              data: [{ id: 'e2', finished: true, mode: 'm', startedAt: 'x', workflowId: 'w1' }],
            })
          ),
        headers: { get: () => 'application/json' },
      });
    const client = new N8nClient(config);
    const all = await client.listExecutionsAll();
    expect(all).toHaveLength(2);
  });

  it('retries on 429', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
        headers: { get: () => 'application/json' },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"data":[]}'),
        headers: { get: () => 'application/json' },
      });
    const client = new N8nClient({ ...config, retries: 1 });
    const res = await client.listWorkflowsPaginated();
    expect(res.data).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 500', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
        headers: { get: () => 'application/json' },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"data":[]}'),
        headers: { get: () => 'application/json' },
      });
    const client = new N8nClient({ ...config, retries: 1 });
    await client.listWorkflows();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws on timeout (AbortError)', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    mockFetch.mockRejectedValue(abortErr);
    const client = new N8nClient({ ...config, timeoutMs: 100, retries: 0 });
    await expect(client.listWorkflows()).rejects.toThrow('timed out');
  });

  it('handles non-JSON response (returns empty data)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      headers: { get: () => 'text/plain' },
    });
    const client = new N8nClient(config);
    const res = await client.listWorkflowsPaginated();
    expect(res.data).toEqual([]);
  });
});
