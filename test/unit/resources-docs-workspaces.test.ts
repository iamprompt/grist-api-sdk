import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpTransport } from '../../src/transport/HttpTransport';
import { OrgsResource } from '../../src/resources/OrgsResource';
import { WorkspacesResource } from '../../src/resources/WorkspacesResource';
import { DocsResource } from '../../src/resources/DocsResource';

describe('OrgsResource', () => {
  let mockFetch = vi.fn<typeof fetch>();
  let transport: HttpTransport;
  let orgs: OrgsResource;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
    transport = new HttpTransport({ fetch: mockFetch });
    orgs = new OrgsResource(transport);
  });

  it('lists organizations', async () => {
    const mockOrgs = [
      { id: 1, name: 'Personal', domain: 'personal', access: 'owners' },
      { id: 2, name: 'Team Workspace', domain: 'team', access: 'editors' },
    ];
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(mockOrgs), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await orgs.list();

    expect(result).toEqual(mockOrgs);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/orgs$/),
      expect.anything()
    );
    const [, init] = mockFetch.mock.calls[0] ?? [];
    expect(init?.method).toBeUndefined();
  });

  it('gets organization details with numeric and string IDs (encoded)', async () => {
    const mockOrg = { id: 42, name: 'Acme Corp', domain: 'acme', access: 'owners' };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(mockOrg), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res1 = await orgs.get(42);
    expect(res1).toEqual(mockOrg);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/orgs\/42$/),
      expect.anything()
    );

    await orgs.get('acme team/sub');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/orgs\/acme%20team%2Fsub$/),
      expect.anything()
    );
  });

  it('lists workspaces in an organization', async () => {
    const mockWorkspaces = [
      { id: 10, name: 'Finance', access: 'owners' },
      { id: 11, name: 'Marketing', access: 'editors' },
    ];
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(mockWorkspaces), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await orgs.getWorkspaces('org-1');
    expect(result).toEqual(mockWorkspaces);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/orgs\/org-1\/workspaces$/),
      expect.anything()
    );
  });
});

describe('WorkspacesResource', () => {
  let mockFetch = vi.fn<typeof fetch>();
  let transport: HttpTransport;
  let workspaces: WorkspacesResource;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
    transport = new HttpTransport({ fetch: mockFetch });
    workspaces = new WorkspacesResource(transport);
  });

  it('gets workspace details by id', async () => {
    const mockDetails = {
      id: 97,
      name: 'Secret Plans',
      access: 'owners',
      docs: [{ id: 'doc1', name: 'Roadmap', isPinned: false, access: 'owners' }],
    };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(mockDetails), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await workspaces.get(97);
    expect(result).toEqual(mockDetails);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/workspaces\/97$/),
      expect.anything()
    );
  });

  it('creates workspace under an org and returns numeric id', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(155), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const wid = await workspaces.create('org-xyz', { name: 'New Project' });
    expect(wid).toBe(155);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/orgs\/org-xyz\/workspaces$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'New Project' }),
      })
    );
  });

  it('creates workspace and extracts id if returned as object', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 201 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const wid = await workspaces.create(42, { name: 'Another Project' });
    expect(wid).toBe(201);
  });

  it('updates a workspace name with PATCH', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await workspaces.update(97, { name: 'Updated Plans' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/workspaces\/97$/),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Plans' }),
      })
    );
  });

  it('deletes a workspace via POST /remove', async () => {
    mockFetch.mockResolvedValue(
      new Response(null, { status: 204 })
    );

    await workspaces.delete(97);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/workspaces\/97\/remove$/),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('deletes a workspace with permanent option query parameter', async () => {
    mockFetch.mockResolvedValue(
      new Response(null, { status: 204 })
    );

    await workspaces.delete(97, { permanent: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/97/remove?permanent=true'),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});

describe('DocsResource', () => {
  let mockFetch = vi.fn<typeof fetch>();
  let transport: HttpTransport;
  let docs: DocsResource;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
    transport = new HttpTransport({ fetch: mockFetch });
    docs = new DocsResource(transport);
  });

  it('lists all accessible documents', async () => {
    const mockDocs = [
      { id: 'doc1', name: 'Doc 1', access: 'owners', isPinned: false },
      { id: 'doc2', name: 'Doc 2', access: 'viewers', isPinned: true },
    ];
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(mockDocs), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await docs.list();
    expect(result).toEqual(mockDocs);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/docs$/),
      expect.anything()
    );
  });

  it('gets doc metadata by id', async () => {
    const mockDoc = {
      id: 'doc123',
      name: 'Project Lollipop',
      isPinned: true,
      access: 'owners',
      workspace: { id: 42, name: 'Main' },
    };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(mockDoc), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await docs.get('doc123');
    expect(result).toEqual(mockDoc);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/docs\/doc123$/),
      expect.anything()
    );
  });

  it('properly URI encodes docId in get()', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 'doc/with space' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await docs.get('doc/with space');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/docs\/doc%2Fwith%20space$/),
      expect.anything()
    );
  });

  it('calls correct endpoint to create a document', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify('newDocId123'), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const docId = await docs.create(42, { name: 'My Test Doc' });
    expect(docId).toBe('newDocId123');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/42/docs'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'My Test Doc' }),
      })
    );
  });

  it('creates document and extracts id if returned as object', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 'objDocId456' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const docId = await docs.create(42, { name: 'Object Doc' });
    expect(docId).toBe('objDocId456');
  });

  it('renames a document with PATCH /docs/{docId}', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await docs.rename('doc123', 'New Document Name');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/docs\/doc123$/),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'New Document Name' }),
      })
    );
  });

  it('deletes a document via POST /docs/{docId}/remove', async () => {
    mockFetch.mockResolvedValue(
      new Response(null, { status: 204 })
    );

    await docs.delete('doc123');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/docs\/doc123\/remove$/),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('deletes a document with permanent option', async () => {
    mockFetch.mockResolvedValue(
      new Response(null, { status: 204 })
    );

    await docs.delete('doc123', { permanent: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc123/remove?permanent=true'),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('pins a document via POST /docs/{docId}/pin', async () => {
    mockFetch.mockResolvedValue(
      new Response(null, { status: 200 })
    );

    await docs.pin('doc123');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/docs\/doc123\/pin$/),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('unpins a document via POST /docs/{docId}/unpin', async () => {
    mockFetch.mockResolvedValue(
      new Response(null, { status: 200 })
    );

    await docs.unpin('doc123');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/docs\/doc123\/unpin$/),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('encodes special characters in docId for rename, pin, unpin, and delete', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await docs.rename('doc/test 1', 'New Name');
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/api\/docs\/doc%2Ftest%201$/),
      expect.anything()
    );

    await docs.pin('doc/test 1');
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/api\/docs\/doc%2Ftest%201\/pin$/),
      expect.anything()
    );

    await docs.unpin('doc/test 1');
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/api\/docs\/doc%2Ftest%201\/unpin$/),
      expect.anything()
    );

    await docs.delete('doc/test 1');
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/api\/docs\/doc%2Ftest%201\/remove$/),
      expect.anything()
    );
  });

  it('propagates GristNotFoundError when document is not found', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Document not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(docs.get('nonexistent')).rejects.toThrow('Document not found');
  });
});
