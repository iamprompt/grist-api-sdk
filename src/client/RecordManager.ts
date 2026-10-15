import { GristNotFoundError } from '../errors';
import { RecordsResource } from '../resources/RecordsResource';
import { HttpTransport } from '../transport/HttpTransport';
import { RecordEnvelope } from '../types/rest';
import { QueryBuilder } from './QueryBuilder';

export { QueryBuilder } from './QueryBuilder';

/**
 * Record with Grist row ID preserved as a numeric property `id`.
 */
export type RecordWithId<T extends object = Record<string, unknown>> = Omit<T, 'id'> & { id: number };

/**
 * Query and presentation options for RecordManager.list.
 */
export interface RecordListFluentOptions<T extends object = Record<string, unknown>> {
  filter?: Partial<Record<keyof T | string, unknown[]>> | Record<string, unknown[]> | string;
  sort?: (keyof T | string)[] | string;
  limit?: number;
  offset?: number;
  hidden?: boolean;
  raw?: boolean;
}

/**
 * Options for RecordManager.upsert.
 */
export interface RecordUpsertOptions<T extends object = Record<string, unknown>> {
  keyCols: (keyof T | string)[];
  onMany?: ('first' | 'none' | 'all') | (string & {});
}

/**
 * Options for RecordManager.iterate.
 */
export interface RecordIterateOptions<T extends object = Record<string, unknown>> {
  batchSize?: number;
  filter?: Partial<Record<keyof T | string, unknown[]>> | Record<string, unknown[]> | string;
  sort?: (keyof T | string)[] | string;
  hidden?: boolean;
}

/**
 * Transforms a Grist record envelope into a flattened object with numeric row ID.
 *
 * Preserves the numeric row ID as `id` even if user fields include an `id` column.
 */
export function flattenRecord<T extends object = Record<string, unknown>>(
  record: RecordEnvelope<T>
): RecordWithId<T> {
  return {
    ...record.fields,
    id: record.id,
  } as RecordWithId<T>;
}

/**
 * High-level record manager providing CRUD, batch upsert, and auto-pagination.
 */
export class RecordManager<T extends object = Record<string, unknown>> {
  constructor(
    _transport: HttpTransport,
    private readonly docId: string,
    readonly tableId: string,
    private readonly recordsResource: RecordsResource = new RecordsResource(_transport)
  ) {}

  /**
   * Lists records from the table. By default, records are flattened into `{ id, ...fields }`.
   * Passing `raw: true` returns the raw `{ id, fields }` envelopes.
   */
  async list(options: RecordListFluentOptions<T> & { raw: true }): Promise<RecordEnvelope<T>[]>;
  async list(options?: RecordListFluentOptions<T> & { raw?: false }): Promise<RecordWithId<T>[]>;
  async list(options?: RecordListFluentOptions<T>): Promise<RecordWithId<T>[] | RecordEnvelope<T>[]>;
  async list(options?: RecordListFluentOptions<T>): Promise<RecordWithId<T>[] | RecordEnvelope<T>[]> {
    const records = await this.recordsResource.list<T>(this.docId, this.tableId, {
      filter: options?.filter as Record<string, unknown[]> | string | undefined,
      sort: Array.isArray(options?.sort) ? options.sort.map(String) : options?.sort,
      limit: options?.limit,
      offset: options?.offset,
      hidden: options?.hidden,
    });

    if (options?.raw) {
      return records;
    }

    return records.map((rec) => flattenRecord(rec));
  }

  /**
   * Retrieves a single record by its numeric row ID.
   * Throws GristNotFoundError if no record exists with the given ID.
   */
  async get(recordId: number): Promise<RecordWithId<T>> {
    const records = await this.recordsResource.list<T>(this.docId, this.tableId, {
      filter: { id: [recordId] },
      limit: 1,
    });

    const record = records[0];
    if (!record) {
      throw new GristNotFoundError(
        `Record ${recordId} not found in table "${this.tableId}"`
      );
    }

    return flattenRecord(record);
  }

  /**
   * Creates one or more records in the table.
   *
   * Handles single record or array of records. Preserves row ID as `id` in returned records.
   * Safely returns an empty array without making HTTP requests if an empty array is passed.
   */
  async create(data: T): Promise<RecordWithId<T>>;
  async create(data: T[]): Promise<RecordWithId<T>[]>;
  async create(data: T | T[]): Promise<RecordWithId<T> | RecordWithId<T>[]>;
  async create(data: T | T[]): Promise<RecordWithId<T> | RecordWithId<T>[]> {
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return [];
      }
      const payloads = data.map((fields) => ({ fields }));
      const res = await this.recordsResource.create<T>(this.docId, this.tableId, payloads);
      return data.map((item, index) => {
        const id = res.records[index]?.id;
        return {
          ...item,
          id,
        } as RecordWithId<T>;
      });
    }

    const res = await this.recordsResource.create<T>(this.docId, this.tableId, [{ fields: data }]);
    const id = res.records[0]?.id;
    return {
      ...data,
      id,
    } as RecordWithId<T>;
  }

  /**
   * Updates an existing record by row ID with partial fields, or batch updates multiple records.
   *
   * Safely no-ops without making HTTP requests if an empty array is provided.
   */
  async update(recordId: number, data: Partial<T>): Promise<void>;
  async update(records: Array<{ id: number; fields: Partial<T> }>): Promise<void>;
  async update(
    recordIdOrRecords: number | Array<{ id: number; fields: Partial<T> }>,
    data?: Partial<T>
  ): Promise<void> {
    if (Array.isArray(recordIdOrRecords)) {
      if (recordIdOrRecords.length === 0) {
        return;
      }
      await this.recordsResource.update<T>(this.docId, this.tableId, recordIdOrRecords);
      return;
    }

    await this.recordsResource.update<T>(this.docId, this.tableId, [
      { id: recordIdOrRecords, fields: data ?? {} },
    ]);
  }

  /**
   * Upserts records matching existing rows based on key columns or creating new ones.
   *
   * Safely no-ops without making HTTP requests if an empty array is provided.
   */
  async upsert(records: T[], options: RecordUpsertOptions<T>): Promise<void> {
    if (!records || records.length === 0) {
      return;
    }

    const keyColSet = new Set((options.keyCols as string[]).map(String));
    const payloads = records.map((record) => {
      const require: Record<string, unknown> = {};
      const fields: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(record)) {
        if (keyColSet.has(key)) {
          require[key] = value;
        } else if (key !== 'id') {
          fields[key] = value;
        }
      }

      return {
        require,
        fields: fields as T,
      };
    });

    await this.recordsResource.upsert(this.docId, this.tableId, payloads, {
      onMany: options.onMany,
    });
  }

  /**
   * Deletes one or more records by their numeric row IDs.
   *
   * Safely no-ops without making HTTP requests if an empty array is provided.
   */
  async delete(recordIds: number | number[]): Promise<void> {
    const ids = Array.isArray(recordIds) ? recordIds : [recordIds];
    if (ids.length === 0) {
      return;
    }
    await this.recordsResource.delete(this.docId, this.tableId, ids);
  }

  /**
   * Auto-paginating async generator yielding records row by row across pages.
   */
  async *iterate(options?: RecordIterateOptions<T>): AsyncIterableIterator<RecordWithId<T>> {
    const batchSize = Math.max(1, options?.batchSize ?? 100);
    let offset = 0;

    while (true) {
      const records = await this.recordsResource.list<T>(this.docId, this.tableId, {
        limit: batchSize,
        offset,
        filter: options?.filter as Record<string, unknown[]> | string | undefined,
        sort: Array.isArray(options?.sort) ? options.sort.map(String) : options?.sort,
        hidden: options?.hidden,
      });

      for (const rec of records) {
        yield flattenRecord(rec);
      }

      if (records.length < batchSize) {
        break;
      }

      offset += records.length;
    }
  }

  /**
   * Creates a chainable query builder for filtering, sorting, and pagination.
   */
  query(): QueryBuilder<T> {
    return new QueryBuilder<T>(this);
  }
}
