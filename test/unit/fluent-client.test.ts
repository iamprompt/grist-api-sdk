import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GristClient } from '../../src/client/GristClient';
import { DocClient } from '../../src/client/DocClient';
import { TableClient } from '../../src/client/TableClient';
import { RecordManager } from '../../src/client/RecordManager';
import { GristNotFoundError, GristValidationError } from '../../src/errors';

interface Product {
  Name: string;
  Price: number;
  Stock?: number;
}

interface CustomIdRecord {
  id: string;
  Name: string;
}

describe('GristClient Fluent API', () => {
  let mockFetch = vi.fn<typeof fetch>();

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
  });

  describe('RecordManager', () => {
    it('flattens records by default: { id: 1, Name: "Book", Price: 10 }', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            records: [{ id: 1, fields: { Name: 'Book', Price: 10 } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      const records = await grist.doc('doc1').table<Product>('Products').records.list();

      expect(records).toEqual([{ id: 1, Name: 'Book', Price: 10 }]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/docs/doc1/tables/Products/records'),
        expect.any(Object)
      );
    });

    it('returns raw envelope when raw: true is passed', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            records: [{ id: 1, fields: { Name: 'Book', Price: 10 } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      const records = await grist.doc('doc1').table<Product>('Products').records.list({ raw: true });

      expect(records).toEqual([{ id: 1, fields: { Name: 'Book', Price: 10 } }]);
    });

    it('passes filter, sort, and limit query parameters to list', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ records: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      await grist.doc('doc1').table<Product>('Products').records.list({
        filter: { Name: ['Book'] },
        sort: ['-Price', 'Name'],
        limit: 25,
      });

      const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.get('filter')).toBe('{"Name":["Book"]}');
      expect(calledUrl.searchParams.get('sort')).toBe('-Price,Name');
      expect(calledUrl.searchParams.get('limit')).toBe('25');
    });

    it('handles Review Focus 3: retains row ID as numeric id when user record has a column explicitly named id', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              records: [{ id: 42, fields: { id: 'custom-sku-123', Name: 'Widget' } }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      const records = await grist.doc('doc1').table<CustomIdRecord>('Items').records.list();

      // Row ID 42 must be preserved as .id
      expect(records).toEqual([{ id: 42, Name: 'Widget' }]);

      // Raw mode provides unambiguous access to fields.id
      const rawRecords = await grist.doc('doc1').table<CustomIdRecord>('Items').records.list({ raw: true });
      expect(rawRecords[0]?.fields.id).toBe('custom-sku-123');
      expect(rawRecords[0]?.id).toBe(42);
    });

    it('gets a single record by recordId', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            records: [{ id: 142, fields: { Name: 'Keyboard', Price: 99.99 } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      const record = await grist.doc('doc1').table<Product>('Products').records.get(142);

      expect(record).toEqual({ id: 142, Name: 'Keyboard', Price: 99.99 });
      const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.get('filter')).toBe('{"id":[142]}');
    });

    it('throws GristNotFoundError when get(recordId) finds no record', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ records: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      await expect(
        grist.doc('doc1').table<Product>('Products').records.get(999)
      ).rejects.toThrow(GristNotFoundError);
    });

    it('creates a single record and returns flattened record with id', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ records: [{ id: 55 }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      const created = await grist.doc('doc1').table<Product>('Products').records.create({
        Name: 'Desk Lamp',
        Price: 35,
      });

      expect(created).toEqual({ id: 55, Name: 'Desk Lamp', Price: 35 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/docs/doc1/tables/Products/records'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ records: [{ fields: { Name: 'Desk Lamp', Price: 35 } }] }),
        })
      );
    });

    it('creates multiple records and returns array of flattened records with ids', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ records: [{ id: 101 }, { id: 102 }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      const created = await grist.doc('doc1').table<Product>('Products').records.create([
        { Name: 'Pen', Price: 2 },
        { Name: 'Paper', Price: 5 },
      ]);

      expect(created).toEqual([
        { id: 101, Name: 'Pen', Price: 2 },
        { id: 102, Name: 'Paper', Price: 5 },
      ]);
    });

    it('no-ops on empty array for create (Review Focus 4)', async () => {
      const grist = new GristClient({ fetch: mockFetch });
      const res = await grist.doc('doc1').table<Product>('Products').records.create([]);

      expect(res).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('preserves numeric row ID when creating records that contain an id property (Review Focus 3)', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ records: [{ id: 88 }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      const created = await grist.doc('doc1').table<CustomIdRecord>('Items').records.create({
        id: 'user-sku-999',
        Name: 'Custom SKU Item',
      });

      expect(created).toEqual({ id: 88, Name: 'Custom SKU Item' });
    });

    it('updates a record by ID', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

      const grist = new GristClient({ fetch: mockFetch });
      await grist.doc('doc1').table<Product>('Products').records.update(142, {
        Price: 89.99,
        Stock: 10,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/docs/doc1/tables/Products/records'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            records: [{ id: 142, fields: { Price: 89.99, Stock: 10 } }],
          }),
        })
      );
    });

    it('batch updates multiple records with array of { id, fields }', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

      const grist = new GristClient({ fetch: mockFetch });
      await grist.doc('doc1').table<Product>('Products').records.update([
        { id: 142, fields: { Price: 99.99 } },
        { id: 143, fields: { Stock: 5 } },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/docs/doc1/tables/Products/records'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            records: [
              { id: 142, fields: { Price: 99.99 } },
              { id: 143, fields: { Stock: 5 } },
            ],
          }),
        })
      );
    });

    it('safely no-ops on empty array for batch update', async () => {
      const grist = new GristClient({ fetch: mockFetch });
      await grist.doc('doc1').table<Product>('Products').records.update([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('safely no-ops on empty array for batch upsert (Review Focus 4)', async () => {
      const grist = new GristClient({ fetch: mockFetch });
      await grist.doc('doc1').table<Product>('Products').records.upsert([], { keyCols: ['Name'] });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('upserts records with require for keyCols and fields for rest', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

      const grist = new GristClient({ fetch: mockFetch });
      await grist.doc('doc1').table<Product>('Products').records.upsert(
        [
          { Name: 'Keyboard', Price: 79.99, Stock: 20 },
          { Name: 'Mouse', Price: 29.99, Stock: 50 },
        ],
        { keyCols: ['Name'] }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/docs/doc1/tables/Products/records'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            records: [
              {
                require: { Name: 'Keyboard' },
                fields: { Price: 79.99, Stock: 20 },
              },
              {
                require: { Name: 'Mouse' },
                fields: { Price: 29.99, Stock: 50 },
              },
            ],
          }),
        })
      );
    });

    it('deletes records by single ID or array of IDs', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

      const grist = new GristClient({ fetch: mockFetch });

      // Single ID
      await grist.doc('doc1').table('Products').records.delete(142);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/docs/doc1/tables/Products/records/delete'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify([142]),
        })
      );

      // Multiple IDs
      mockFetch.mockClear();
      await grist.doc('doc1').table('Products').records.delete([142, 143]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/docs/doc1/tables/Products/records/delete'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify([142, 143]),
        })
      );
    });

    it('safely no-ops on empty array for delete (Review Focus 4)', async () => {
      const grist = new GristClient({ fetch: mockFetch });
      await grist.doc('doc1').table('Products').records.delete([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('iterates through records with auto-pagination', async () => {
      // First page returns batch of 2 records
      mockFetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              records: [
                { id: 1, fields: { Name: 'Item 1', Price: 10 } },
                { id: 2, fields: { Name: 'Item 2', Price: 20 } },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
        // Second page returns 1 record (less than batchSize 2 -> indicates termination)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              records: [
                { id: 3, fields: { Name: 'Item 3', Price: 30 } },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );

      const grist = new GristClient({ fetch: mockFetch });
      const yielded: Product[] = [];

      for await (const row of grist.doc('doc1').table<Product>('Products').records.iterate({ batchSize: 2 })) {
        yielded.push(row);
      }

      expect(yielded).toEqual([
        { id: 1, Name: 'Item 1', Price: 10 },
        { id: 2, Name: 'Item 2', Price: 20 },
        { id: 3, Name: 'Item 3', Price: 30 },
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const firstCallUrl = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(firstCallUrl.searchParams.get('limit')).toBe('2');
      expect(firstCallUrl.searchParams.get('offset')).toBe('0');

      const secondCallUrl = new URL(mockFetch.mock.calls[1]![0] as string);
      expect(secondCallUrl.searchParams.get('limit')).toBe('2');
      expect(secondCallUrl.searchParams.get('offset')).toBe('2');
    });

    it('guards against non-positive batchSize in iterate by clamping to at least 1', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ records: [{ id: 1, fields: { Name: 'Item 1', Price: 10 } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      const generator = grist.doc('doc1').table<Product>('Products').records.iterate({ batchSize: 0 });
      await generator.next();

      const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.get('limit')).toBe('1');
    });

    it('handles Review Focus 2: URI-encodes table IDs with spaces and symbols', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ records: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const grist = new GristClient({ fetch: mockFetch });
      await grist.doc('doc 123').table('Order Details').records.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/docs/doc%20123/tables/Order%20Details/records'),
        expect.any(Object)
      );
    });
  });

  describe('TableClient', () => {
    it('provides tableId, records, and columns operations', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            columns: [{ id: 'Col1', fields: { label: 'Col 1', type: 'Text' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      const table = grist.doc('doc1').table('Products');

      expect(table).toBeInstanceOf(TableClient);
      expect(table.tableId).toBe('Products');
      expect(table.records).toBeInstanceOf(RecordManager);

      const cols = await table.columns.list();
      expect(cols).toEqual([{ id: 'Col1', fields: { label: 'Col 1', type: 'Text' } }]);

      // Create a single column
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
      await table.columns.create({
        id: 'DiscountCode',
        fields: { label: 'Discount Code', type: 'Text' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/docs/doc1/tables/Products/columns'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            columns: [{ id: 'DiscountCode', fields: { label: 'Discount Code', type: 'Text' } }],
          }),
        })
      );
    });
  });

  describe('DocClient', () => {
    it('executes SQL queries via doc.sql', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            records: [
              { fields: { Category: 'Electronics', TotalRevenue: 500 } },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      const results = await grist.doc('doc1').sql('SELECT Category, TotalRevenue FROM Products WHERE TotalRevenue > ?', [100]);

      expect(results).toEqual([{ Category: 'Electronics', TotalRevenue: 500 }]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/docs/doc1/sql'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            sql: 'SELECT Category, TotalRevenue FROM Products WHERE TotalRevenue > ?',
            args: [100],
          }),
        })
      );
    });

    it('provides doc-scoped tables operations', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ tables: [{ id: 'Table1', fields: {} }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const grist = new GristClient({ fetch: mockFetch });
      const doc = grist.doc('doc1');

      const tables = await doc.tables.list();
      expect(tables).toEqual([{ id: 'Table1', fields: {} }]);

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
      await doc.tables.create({
        id: 'NewTable',
        columns: [{ id: 'Col1', fields: { type: 'Text' } }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/docs/doc1/tables'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            tables: [{ id: 'NewTable', columns: [{ id: 'Col1', fields: { type: 'Text' } }] }],
          }),
        })
      );
    });

    it('provides doc-scoped attachments operations', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify([42]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

      const grist = new GristClient({ fetch: mockFetch });
      const doc = grist.doc('doc1');

      const ids = await doc.attachments.upload({
        filename: 'receipt.pdf',
        data: new Uint8Array([1, 2, 3]),
        contentType: 'application/pdf',
      });
      expect(ids).toEqual([42]);

      mockFetch.mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      );
      const data = await doc.attachments.download(42);
      expect(new Uint8Array(data)).toEqual(new Uint8Array([1, 2, 3]));

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 42, fileName: 'receipt.pdf', fileSize: 3 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const meta = await doc.attachments.getMetadata(42);
      expect(meta.fileName).toBe('receipt.pdf');
    });

    it('provides doc-scoped webhooks operations', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ webhooks: [{ id: 'wh1', url: 'https://example.com' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const grist = new GristClient({ fetch: mockFetch });
      const doc = grist.doc('doc1');

      const list = await doc.webhooks.list();
      expect(list).toEqual([{ id: 'wh1', url: 'https://example.com' }]);

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'wh2' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
      const created = await doc.webhooks.create({
        url: 'https://hooks.example.com',
        eventTypes: ['add'],
        tableId: 'Products',
      });
      expect(created).toEqual({ id: 'wh2' });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
      await doc.webhooks.update('wh2', { enabled: false });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
      await doc.webhooks.delete('wh2');
    });
  });

  describe('GristClient & fromDocUrl', () => {
    it('exposes raw low-level resources', () => {
      const grist = new GristClient();
      expect(grist.raw.orgs).toBeDefined();
      expect(grist.raw.workspaces).toBeDefined();
      expect(grist.raw.docs).toBeDefined();
      expect(grist.raw.tables).toBeDefined();
      expect(grist.raw.columns).toBeDefined();
      expect(grist.raw.records).toBeDefined();
      expect(grist.raw.attachments).toBeDefined();
      expect(grist.raw.webhooks).toBeDefined();
      expect(grist.raw.sql).toBeDefined();
    });

    it('creates DocClient from standard doc URL', () => {
      const doc = GristClient.fromDocUrl('https://docs.getgrist.com/123456789abc/My-Doc');
      expect(doc.id).toBe('123456789abc');
      expect(doc).toBeInstanceOf(DocClient);
    });

    it('creates DocClient from team domain doc URL', () => {
      const doc = GristClient.fromDocUrl('https://my-team.getgrist.com/docId123');
      expect(doc.id).toBe('docId123');
    });

    it('creates DocClient from /doc/docId format', () => {
      const doc = GristClient.fromDocUrl('https://docs.getgrist.com/doc/abc987/Doc-Title');
      expect(doc.id).toBe('abc987');
    });

    it('creates DocClient from /o/team/doc/docId format', () => {
      const doc = GristClient.fromDocUrl('https://custom.grist.com/o/myorg/doc/xyz567');
      expect(doc.id).toBe('xyz567');
    });

    it('creates DocClient from bare doc ID string', () => {
      const doc = GristClient.fromDocUrl('plainDocId123');
      expect(doc.id).toBe('plainDocId123');
    });

    it('throws GristValidationError on invalid doc URL or reserved path segments', () => {
      expect(() => GristClient.fromDocUrl('')).toThrow(GristValidationError);
      expect(() => GristClient.fromDocUrl('https://docs.getgrist.com/')).toThrow(GristValidationError);
      expect(() => GristClient.fromDocUrl('https://docs.getgrist.com/doc/')).toThrow(GristValidationError);
      expect(() => GristClient.fromDocUrl('https://docs.getgrist.com/o/myorg')).toThrow(GristValidationError);
      expect(() => GristClient.fromDocUrl('https://docs.getgrist.com/o/myorg/doc')).toThrow(GristValidationError);
      expect(() => GristClient.fromDocUrl('doc')).toThrow(GristValidationError);
      expect(() => GristClient.fromDocUrl('o')).toThrow(GristValidationError);
    });
  });
});
