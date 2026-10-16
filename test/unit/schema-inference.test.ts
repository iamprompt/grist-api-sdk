import { describe, it, expect, vi } from 'vitest';
import { GristClient } from '../../src/client/GristClient';
import { TableClient } from '../../src/client/TableClient';

describe('Schema-driven Bracketless Type Inference', () => {
  interface TasksRow {
    Title: string;
    Done: boolean;
  }

  interface UsersRow {
    Email: string;
    Age: number;
  }

  interface MyTables {
    Tasks: TasksRow;
    Users: UsersRow;
  }

  it('infers row types from document schema without generic brackets on table()', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [
            { id: 1, fields: { Title: 'Finish SDK', Done: true } },
            { id: 2, fields: { Title: 'Deploy', Done: false } },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const client = new GristClient({ apiKey: 'test-key', fetch: mockFetch });
    const doc = client.doc<MyTables>('doc123');

    // Zero generic brackets on .table('Tasks')!
    const tasksTable = doc.table('Tasks');
    expect(tasksTable).toBeInstanceOf(TableClient);
    expect(tasksTable.tableId).toBe('Tasks');

    const tasks = await tasksTable.records.list();
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.id).toBe(1);
    expect(tasks[0]?.Title).toBe('Finish SDK');
    expect(tasks[0]?.Done).toBe(true);
  });

  it('infers row types from static fromDocUrl without generic brackets on table()', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [{ id: 42, fields: { Email: 'alice@example.com', Age: 30 } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    // Pass schema to fromDocUrl
    const doc = GristClient.fromDocUrl<MyTables>('https://docs.getgrist.com/doc456', {
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const usersTable = doc.table('Users');
    expect(usersTable.tableId).toBe('Users');

    const users = await usersTable.records.list();
    expect(users[0]?.id).toBe(42);
    expect(users[0]?.Email).toBe('alice@example.com');
    expect(users[0]?.Age).toBe(30);
  });

  it('allows explicit generic override when table is not in schema', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [{ id: 99, fields: { CustomField: 'test' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const client = new GristClient({ apiKey: 'test-key', fetch: mockFetch });
    const doc = client.doc<MyTables>('doc123');

    // Fallback or explicit generic for non-schema tables
    interface AdHocRow {
      CustomField: string;
    }
    const adHocTable = doc.table<AdHocRow>('UnregisteredTable');
    const records = await adHocTable.records.list();
    expect(records[0]?.CustomField).toBe('test');
  });

  it('defaults gracefully to TableClient<any> when no schema is registered', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [{ id: 1, fields: { AnyField: 123 } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const client = new GristClient({ apiKey: 'test-key', fetch: mockFetch });
    const doc = client.doc('doc123');
    const table = doc.table('DynamicTable');
    const records = await table.records.list();
    expect(records[0]?.AnyField).toBe(123);
  });
});
