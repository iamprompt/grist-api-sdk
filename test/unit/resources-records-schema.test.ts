import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpTransport } from '../../src/transport/HttpTransport';
import { RecordsResource } from '../../src/resources/RecordsResource';
import { SqlResource } from '../../src/resources/SqlResource';
import { TablesResource } from '../../src/resources/TablesResource';
import { ColumnsResource } from '../../src/resources/ColumnsResource';
import { GristNotFoundError } from '../../src/errors';

describe('RecordsResource', () => {
  let mockFetch = vi.fn<typeof fetch>();
  let transport: HttpTransport;
  let records: RecordsResource;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
    transport = new HttpTransport({ fetch: mockFetch });
    records = new RecordsResource(transport);
  });

  it('properly URI encodes table IDs and doc IDs containing spaces or symbols', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await records.list('doc/with slash', 'Order Details');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc%2Fwith%20slash/tables/Order%20Details/records'),
      expect.any(Object)
    );
  });

  it('unwraps records array from { records: [...] } response', async () => {
    const mockRecords = [
      { id: 1, fields: { Name: 'Alice', Age: 30 } },
      { id: 2, fields: { Name: 'Bob', Age: 25 } },
    ];
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ records: mockRecords }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await records.list<{ Name: string; Age: number }>('doc1', 'People');
    expect(result).toEqual(mockRecords);
  });

  it('passes query options (filter as object, sort as array, limit, hidden)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await records.list('doc1', 'Items', {
      filter: { Status: ['Active', 'Pending'] },
      sort: ['Status', '-Price'],
      limit: 50,
      hidden: true,
    });

    const [calledUrl] = mockFetch.mock.calls[0] ?? [];
    const url = new URL(calledUrl as string);

    expect(url.searchParams.get('filter')).toBe(JSON.stringify({ Status: ['Active', 'Pending'] }));
    expect(url.searchParams.get('sort')).toBe('Status,-Price');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('hidden')).toBe('true');
  });

  it('passes filter as string and sort as string without modification', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await records.list('doc1', 'Items', {
      filter: '{"Status":["Done"]}',
      sort: '-CreatedAt',
    });

    const [calledUrl] = mockFetch.mock.calls[0] ?? [];
    const url = new URL(calledUrl as string);

    expect(url.searchParams.get('filter')).toBe('{"Status":["Done"]}');
    expect(url.searchParams.get('sort')).toBe('-CreatedAt');
  });

  it('creates records via POST /docs/{docId}/tables/{tableId}/records', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ records: [{ id: 101 }, { id: 102 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const newRecords = [
      { fields: { Title: 'Task 1' } },
      { fields: { Title: 'Task 2' } },
    ];

    const res = await records.create('doc 1', 'Table 1', newRecords);

    expect(res).toEqual({ records: [{ id: 101 }, { id: 102 }] });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc%201/tables/Table%201/records'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ records: newRecords }),
      })
    );
  });

  it('normalizes numeric ID records array in create response', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ records: [101, 102] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res = await records.create('doc1', 'Table1', [{ fields: { Title: 'Task 1' } }]);
    expect(res).toEqual({ records: [{ id: 101 }, { id: 102 }] });
  });

  it('updates records via PATCH /docs/{docId}/tables/{tableId}/records', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const updates = [{ id: 1, fields: { Title: 'Updated Task' } }];
    await records.update('doc1', 'Tasks', updates);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc1/tables/Tasks/records'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ records: updates }),
      })
    );
  });

  it('upserts records via PUT /docs/{docId}/tables/{tableId}/records with onMany option', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const upsertRows = [{ fields: { Code: 'A1', Amount: 50 } }];
    await records.upsert('doc1', 'Inventory Items', upsertRows, { onMany: 'first' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc1/tables/Inventory%20Items/records?onMany=first'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ records: upsertRows }),
      })
    );
  });

  it('deletes records via POST /docs/{docId}/tables/{tableId}/records/delete', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await records.delete('doc1', 'Order Details', [10, 11, 12]);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc1/tables/Order%20Details/records/delete'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify([10, 11, 12]),
      })
    );
  });
});

describe('SqlResource', () => {
  let mockFetch = vi.fn<typeof fetch>();
  let transport: HttpTransport;
  let sql: SqlResource;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
    transport = new HttpTransport({ fetch: mockFetch });
    sql = new SqlResource(transport);
  });

  it('posts SQL queries to /docs/{docId}/sql and unwraps direct records', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ records: [{ id: 1, count: 5 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await sql.query('doc 1', 'SELECT count(*) FROM Items');

    expect(result).toEqual([{ id: 1, count: 5 }]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc%201/sql'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sql: 'SELECT count(*) FROM Items' }),
      })
    );
  });

  it('unwraps records with fields property', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [
            { fields: { id: 1, pet: 'cat', popularity: 67 } },
            { fields: { id: 2, pet: 'dog', popularity: 89 } },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await sql.query('doc1', 'SELECT * FROM Pets');
    expect(result).toEqual([
      { id: 1, pet: 'cat', popularity: 67 },
      { id: 2, pet: 'dog', popularity: 89 },
    ]);
  });

  it('unwraps records with outer id and fields property', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [
            { id: 10, fields: { pet: 'parrot', popularity: 40 } },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await sql.query('doc1', 'SELECT * FROM Pets');
    expect(result).toEqual([
      { id: 10, pet: 'parrot', popularity: 40 },
    ]);
  });

  it('passes positional args when params are provided', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ records: [{ pet: 'cat' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await sql.query('doc1', 'SELECT * FROM Pets WHERE popularity > ?', [50]);

    expect(result).toEqual([{ pet: 'cat' }]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc1/sql'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sql: 'SELECT * FROM Pets WHERE popularity > ?',
          args: [50],
        }),
      })
    );
  });
});

describe('TablesResource', () => {
  let mockFetch = vi.fn<typeof fetch>();
  let transport: HttpTransport;
  let tables: TablesResource;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
    transport = new HttpTransport({ fetch: mockFetch });
    tables = new TablesResource(transport);
  });

  it('lists tables via GET /docs/{docId}/tables and unwraps tables array', async () => {
    const mockTables = [
      { id: 'Table1', fields: {} },
      { id: 'Table2', fields: {} },
    ];
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ tables: mockTables }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await tables.list('doc 123');

    expect(result).toEqual(mockTables);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc%20123/tables'),
      expect.any(Object)
    );
  });

  it('creates tables via POST /docs/{docId}/tables', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const payload = {
      tables: [
        {
          id: 'Products',
          columns: [
            { id: 'Name', fields: { label: 'Product Name', type: 'Text' } },
            { id: 'Price', fields: { label: 'Price', type: 'Numeric' } },
          ],
        },
      ],
    };

    await tables.create('doc1', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc1/tables'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );
  });
});

describe('ColumnsResource', () => {
  let mockFetch = vi.fn<typeof fetch>();
  let transport: HttpTransport;
  let columns: ColumnsResource;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
    transport = new HttpTransport({ fetch: mockFetch });
    columns = new ColumnsResource(transport);
  });

  it('lists columns via GET /docs/{docId}/tables/{tableId}/columns and unwraps columns array', async () => {
    const mockCols = [
      { id: 'Col1', fields: { label: 'Col 1', type: 'Text' } },
      { id: 'Col2', fields: { label: 'Col 2', type: 'Numeric' } },
    ];
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ columns: mockCols }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await columns.list('doc 1', 'Table 1');

    expect(result).toEqual(mockCols);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc%201/tables/Table%201/columns'),
      expect.any(Object)
    );
  });

  it('creates columns via POST /docs/{docId}/tables/{tableId}/columns', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const payload = {
      columns: [
        {
          id: 'DiscountCode',
          fields: { label: 'Discount Code', type: 'Text' },
        },
      ],
    };

    await columns.create('doc 1', 'Order Details', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc%201/tables/Order%20Details/columns'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );
  });

  it('propagates GristNotFoundError when doc or table is not found', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Table not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(columns.list('doc1', 'NonExistent')).rejects.toThrow(GristNotFoundError);
  });
});
