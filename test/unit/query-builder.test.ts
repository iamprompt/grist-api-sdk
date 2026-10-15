import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GristClient } from '../../src/client/GristClient';
import { QueryBuilder } from '../../src/client/QueryBuilder';

interface Product {
  Name: string;
  Price: number;
  Stock?: number;
}

describe('QueryBuilder', () => {
  let mockFetch = vi.fn<typeof fetch>();

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
  });

  it('instantiates QueryBuilder via RecordManager.query()', () => {
    const grist = new GristClient({ fetch: mockFetch });
    const records = grist.doc('doc1').table<Product>('Products').records;
    const query = records.query();

    expect(query).toBeInstanceOf(QueryBuilder);
  });

  it('supports method chaining for where, sort, limit, offset, and raw', () => {
    const grist = new GristClient({ fetch: mockFetch });
    const records = grist.doc('doc1').table<Product>('Products').records;
    const query = records.query();

    const chained = query
      .where({ Name: ['Keyboard'] })
      .sort('Price', '-Stock')
      .limit(10)
      .offset(5)
      .raw(true);

    expect(chained).toBe(query);
  });

  it('merges multiple where() calls and accumulates sort() keys', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [{ id: 1, fields: { Name: 'Mouse', Price: 25, Stock: 10 } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const grist = new GristClient({ fetch: mockFetch });
    const query = grist.doc('doc1').table<Product>('Products').records.query();

    query
      .where({ Name: ['Mouse'] })
      .where({ Stock: [10] })
      .sort('Name')
      .sort('-Price');

    const results = await query.execute();
    expect(results).toEqual([{ id: 1, Name: 'Mouse', Price: 25, Stock: 10 }]);

    const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
    const filterJson = JSON.parse(calledUrl.searchParams.get('filter')!);
    expect(filterJson).toEqual({ Name: ['Mouse'], Stock: [10] });
    expect(calledUrl.searchParams.get('sort')).toBe('Name,-Price');
  });

  it('executes query returning flattened records by default', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [
            { id: 10, fields: { Name: 'Monitor', Price: 299 } },
            { id: 11, fields: { Name: 'Desk', Price: 450 } },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const grist = new GristClient({ fetch: mockFetch });
    const records = await grist
      .doc('doc1')
      .table<Product>('Products')
      .records.query()
      .limit(2)
      .offset(4)
      .execute();

    expect(records).toEqual([
      { id: 10, Name: 'Monitor', Price: 299 },
      { id: 11, Name: 'Desk', Price: 450 },
    ]);

    const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
    expect(calledUrl.searchParams.get('limit')).toBe('2');
    expect(calledUrl.searchParams.get('offset')).toBe('4');
  });

  it('executes query returning raw record envelopes when raw(true) is called', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [{ id: 42, fields: { Name: 'Laptop', Price: 1200 } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const grist = new GristClient({ fetch: mockFetch });
    const records = await grist
      .doc('doc1')
      .table<Product>('Products')
      .records.query()
      .where({ Name: ['Laptop'] })
      .raw(true)
      .execute();

    expect(records).toEqual([
      { id: 42, fields: { Name: 'Laptop', Price: 1200 } },
    ]);
  });

  it('iterates through pages row-by-row with iterate()', async () => {
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            records: [{ id: 3, fields: { Name: 'Item 3', Price: 30 } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const grist = new GristClient({ fetch: mockFetch });
    const query = grist
      .doc('doc1')
      .table<Product>('Products')
      .records.query()
      .where({ Price: [10, 20, 30] })
      .sort('Price');

    // First call: returns 2 (< 100), so loop completes in one page
    const items: Product[] = [];
    for await (const row of query.iterate()) {
      items.push(row);
    }

    expect(items).toEqual([
      { id: 1, Name: 'Item 1', Price: 10 },
      { id: 2, Name: 'Item 2', Price: 20 },
    ]);

    const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
    expect(calledUrl.searchParams.get('limit')).toBe('100');
    expect(calledUrl.searchParams.get('offset')).toBe('0');
  });

  it('respects limit and offset when using iterate()', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [
            { id: 3, fields: { Name: 'Item 3', Price: 30 } },
            { id: 4, fields: { Name: 'Item 4', Price: 40 } },
            { id: 5, fields: { Name: 'Item 5', Price: 50 } },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const grist = new GristClient({ fetch: mockFetch });
    const query = grist
      .doc('doc1')
      .table<Product>('Products')
      .records.query()
      .offset(2)
      .limit(2);

    const items: Product[] = [];
    for await (const row of query.iterate()) {
      items.push(row);
    }

    expect(items).toHaveLength(2);
    expect(items).toEqual([
      { id: 3, Name: 'Item 3', Price: 30 },
      { id: 4, Name: 'Item 4', Price: 40 },
    ]);

    const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
    expect(calledUrl.searchParams.get('limit')).toBe('2');
    expect(calledUrl.searchParams.get('offset')).toBe('2');
  });
});
