import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpTransport } from '../../src/transport/HttpTransport';
import { AttachmentsResource } from '../../src/resources/AttachmentsResource';
import { WebhooksResource } from '../../src/resources/WebhooksResource';
import { GristNotFoundError } from '../../src/errors';

describe('AttachmentsResource', () => {
  let mockFetch = vi.fn<typeof fetch>();
  let transport: HttpTransport;
  let attachments: AttachmentsResource;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
    transport = new HttpTransport({ fetch: mockFetch });
    attachments = new AttachmentsResource(transport);
  });

  it('uploads a single file using FormData and Uint8Array data', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([101]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const ids = await attachments.upload('doc1', {
      filename: 'file.txt',
      data: new TextEncoder().encode('hello world'),
      contentType: 'text/plain',
    });

    expect(ids).toEqual([101]);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = mockFetch.mock.calls[0] ?? [];
    expect(calledUrl).toContain('/api/docs/doc1/attachments');
    expect(calledInit?.method).toBe('POST');
    expect(calledInit?.body).toBeInstanceOf(FormData);

    const form = calledInit?.body as FormData;
    const uploaded = form.get('upload') as File;
    expect(uploaded).toBeDefined();
    expect(uploaded.name).toBe('file.txt');
    expect(await uploaded.text()).toBe('hello world');
  });

  it('uploads a single file with Blob data', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([202]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const blob = new Blob(['blob content'], { type: 'text/csv' });
    const ids = await attachments.upload('doc1', {
      filename: 'data.csv',
      data: blob,
    });

    expect(ids).toEqual([202]);
    const [, calledInit] = mockFetch.mock.calls[0] ?? [];
    const form = calledInit?.body as FormData;
    const uploaded = form.get('upload') as File;
    expect(uploaded.name).toBe('data.csv');
    expect(await uploaded.text()).toBe('blob content');
  });

  it('uploads multiple files in a single request', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([101, 102]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const ids = await attachments.upload('doc1', [
      {
        filename: 'first.txt',
        data: new TextEncoder().encode('first file'),
        contentType: 'text/plain',
      },
      {
        filename: 'second.png',
        data: new Uint8Array([1, 2, 3]),
        contentType: 'image/png',
      },
    ]);

    expect(ids).toEqual([101, 102]);
    const [, calledInit] = mockFetch.mock.calls[0] ?? [];
    const form = calledInit?.body as FormData;
    const allUploads = form.getAll('upload');
    expect(allUploads).toHaveLength(2);
  });

  it('handles response envelope variants: { attachments: [...] } and { ids: [...] }', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ attachments: [301] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res1 = await attachments.upload('doc1', {
      filename: 'a.txt',
      data: new Uint8Array(),
    });
    expect(res1).toEqual([301]);

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ids: [302] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res2 = await attachments.upload('doc1', {
      filename: 'b.txt',
      data: new Uint8Array(),
    });
    expect(res2).toEqual([302]);
  });

  it('properly URI encodes docId containing spaces or special characters in upload', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([101]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await attachments.upload('doc/with special! chars', {
      filename: 'test.txt',
      data: new Uint8Array(),
    });

    const [calledUrl] = mockFetch.mock.calls[0] ?? [];
    expect(calledUrl).toContain('/api/docs/doc%2Fwith%20special!%20chars/attachments');
  });

  it('downloads attachment binary data via GET /docs/{docId}/attachments/{attachmentId}/download', async () => {
    const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    mockFetch.mockResolvedValue(
      new Response(binaryData, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      })
    );

    const arrayBuffer = await attachments.download('doc1', 101);
    expect(new Uint8Array(arrayBuffer)).toEqual(binaryData);

    const [calledUrl, calledInit] = mockFetch.mock.calls[0] ?? [];
    expect(calledUrl).toContain('/api/docs/doc1/attachments/101/download');
    expect(calledInit?.method).toBeUndefined(); // defaults to GET
  });

  it('throws GristNotFoundError when downloading nonexistent attachment', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Attachment not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(attachments.download('doc1', 9999)).rejects.toThrow(GristNotFoundError);
  });

  it('retrieves attachment metadata via GET /docs/{docId}/attachments/{attachmentId}', async () => {
    const metadata = {
      id: 101,
      fileName: 'report.pdf',
      fileSize: 45678,
      timeUploaded: '2026-10-16T00:00:00.000Z',
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(metadata), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await attachments.getMetadata('doc1', 101);
    expect(result).toEqual(metadata);

    const [calledUrl] = mockFetch.mock.calls[0] ?? [];
    expect(calledUrl).toContain('/api/docs/doc1/attachments/101');
  });

  it('properly URI encodes docId and attachmentId in download and getMetadata', async () => {
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(0), {
        status: 200,
      })
    );

    await attachments.download('doc/1', 42);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc%2F1/attachments/42/download'),
      expect.any(Object)
    );

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ fileName: 'file.txt' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await attachments.getMetadata('doc/1', 42);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc%2F1/attachments/42'),
      expect.any(Object)
    );
  });
});

describe('WebhooksResource', () => {
  let mockFetch = vi.fn<typeof fetch>();
  let transport: HttpTransport;
  let webhooks: WebhooksResource;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
    transport = new HttpTransport({ fetch: mockFetch });
    webhooks = new WebhooksResource(transport);
  });

  it('lists webhooks unwrapping { webhooks: [...] } format', async () => {
    const list = [
      {
        id: 'wh_1',
        fields: {
          name: 'Sync Hook',
          url: 'https://example.com/webhook',
          eventTypes: ['add', 'update'],
          tableId: 'Tasks',
        },
      },
    ];

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ webhooks: list }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await webhooks.list('doc1');
    expect(result).toEqual(list);

    const [calledUrl] = mockFetch.mock.calls[0] ?? [];
    expect(calledUrl).toContain('/api/docs/doc1/webhooks');
  });

  it('lists webhooks unwrapping direct array response format', async () => {
    const list = [
      {
        id: 'wh_2',
        name: 'Alert Hook',
        url: 'https://example.com/alert',
        tableId: 'Orders',
        eventTypes: ['add'],
      },
    ];

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(list), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await webhooks.list('doc1');
    expect(result).toEqual(list);
  });

  it('returns empty array when webhooks response is null or missing', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await webhooks.list('doc1');
    expect(result).toEqual([]);
  });

  it('creates a webhook via POST /docs/{docId}/webhooks and returns { id }', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 'wh_new_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const payload = {
      name: 'Sync to CRM',
      url: 'https://api.mycrm.com/grist-events',
      eventTypes: ['add', 'update'],
      tableId: 'Products',
    };

    const res = await webhooks.create('doc1', payload);
    expect(res).toEqual({ id: 'wh_new_123' });

    const [calledUrl, calledInit] = mockFetch.mock.calls[0] ?? [];
    expect(calledUrl).toContain('/api/docs/doc1/webhooks');
    expect(calledInit?.method).toBe('POST');
    expect(calledInit?.body).toBe(JSON.stringify(payload));
  });

  it('creates a webhook when server returns { webhooks: [{ id: "wh_abc" }] }', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ webhooks: [{ id: 'wh_abc' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res = await webhooks.create('doc1', {
      url: 'https://hook.site/test',
      tableId: 'Table1',
      eventTypes: ['add'],
    });

    expect(res).toEqual({ id: 'wh_abc' });
  });

  it('updates an existing webhook via PATCH /docs/{docId}/webhooks/{webhookId}', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const updatePayload = {
      enabled: false,
    };

    await webhooks.update('doc1', 'wh_123', updatePayload);

    const [calledUrl, calledInit] = mockFetch.mock.calls[0] ?? [];
    expect(calledUrl).toContain('/api/docs/doc1/webhooks/wh_123');
    expect(calledInit?.method).toBe('PATCH');
    expect(calledInit?.body).toBe(JSON.stringify(updatePayload));
  });

  it('deletes a webhook via DELETE /docs/{docId}/webhooks/{webhookId}', async () => {
    mockFetch.mockResolvedValue(
      new Response(null, {
        status: 204,
      })
    );

    await webhooks.delete('doc1', 'wh_123');

    const [calledUrl, calledInit] = mockFetch.mock.calls[0] ?? [];
    expect(calledUrl).toContain('/api/docs/doc1/webhooks/wh_123');
    expect(calledInit?.method).toBe('DELETE');
  });

  it('properly URI encodes docId and webhookId', async () => {
    mockFetch.mockResolvedValue(
      new Response(null, {
        status: 204,
      })
    );

    await webhooks.delete('doc/slash', 'wh/with special #id');

    const [calledUrl] = mockFetch.mock.calls[0] ?? [];
    expect(calledUrl).toContain('/api/docs/doc%2Fslash/webhooks/wh%2Fwith%20special%20%23id');
  });
});
