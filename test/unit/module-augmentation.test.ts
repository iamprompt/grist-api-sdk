import { describe, it, expect, vi } from 'vitest';
import { GristClient } from '../../src/client/GristClient';

interface InvoicesRow {
  InvoiceNumber: string;
  Amount: number;
}

interface CustomersRow {
  Name: string;
  Tier: string;
}

declare module '../../src/types/schema' {
  interface RegisterGristTables {
    tables: {
      Invoices: InvoicesRow;
      Customers: CustomersRow;
    };
  }
}

describe('Global Module Augmentation (Zero Generic Brackets Anywhere)', () => {
  it('automatically resolves table names and row types with NO generic brackets anywhere', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [
            { id: 101, fields: { InvoiceNumber: 'INV-001', Amount: 500 } },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const client = new GristClient({ apiKey: 'test-key', fetch: mockFetch });

    // 1. NO generic brackets on client.doc()
    const doc = client.doc('doc123');

    // 2. NO generic brackets on doc.table()
    const invoicesTable = doc.table('Invoices');
    expect(invoicesTable.tableId).toBe('Invoices');

    const records = await invoicesTable.records.list();
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe(101);
    expect(records[0]?.InvoiceNumber).toBe('INV-001');
    expect(records[0]?.Amount).toBe(500);

    const customersTable = doc.table('Customers');
    expect(customersTable.tableId).toBe('Customers');
  });
});
