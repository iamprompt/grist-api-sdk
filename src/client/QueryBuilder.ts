import type { RecordEnvelope } from '../types/rest';
import type { RecordManager, RecordWithId } from './RecordManager';

/**
 * Fluent query builder for filtering, sorting, paginating, and executing queries on a Grist table.
 */
export class QueryBuilder<T extends object = Record<string, unknown>> {
  private _filter?: Partial<Record<keyof T, unknown[]>>;
  private _sort: (keyof T | string)[] = [];
  private _limit?: number;
  private _offset?: number;
  private _raw?: boolean;

  constructor(private readonly recordManager: RecordManager<T>) {}

  /**
   * Sets or merges filter conditions for the query.
   */
  where(filter: Partial<Record<keyof T, unknown[]>>): this {
    this._filter = {
      ...this._filter,
      ...filter,
    };
    return this;
  }

  /**
   * Specifies one or more sort keys (e.g. `'Name'`, `'-Price'`).
   */
  sort(...sortKeys: (keyof T | string)[]): this {
    for (const key of sortKeys) {
      if (Array.isArray(key)) {
        this._sort.push(...(key as (keyof T | string)[]));
      } else {
        this._sort.push(key);
      }
    }
    return this;
  }

  /**
   * Sets the maximum number of records to return.
   */
  limit(count: number): this {
    this._limit = count;
    return this;
  }

  /**
   * Sets the number of records to skip before returning results.
   */
  offset(start: number): this {
    this._offset = start;
    return this;
  }

  /**
   * Sets whether to return raw record envelopes `{ id, fields }` instead of flattened records.
   */
  raw(isRaw: boolean = true): this {
    this._raw = isRaw;
    return this;
  }

  /**
   * Executes the query and returns matching records.
   */
  async execute(): Promise<RecordWithId<T>[] | RecordEnvelope<T>[]> {
    return this.recordManager.list({
      filter: this._filter as Record<string, unknown[]> | undefined,
      sort: this._sort.length > 0 ? this._sort : undefined,
      limit: this._limit,
      offset: this._offset,
      raw: this._raw,
    });
  }

  /**
   * Auto-paginating async generator yielding records row by row based on query parameters.
   */
  async *iterate(): AsyncIterableIterator<RecordWithId<T>> {
    let offset = this._offset ?? 0;
    const maxRecords = this._limit;
    let yieldedCount = 0;
    const batchSize = maxRecords !== undefined ? Math.min(100, maxRecords) : 100;

    while (true) {
      const currentBatchSize =
        maxRecords !== undefined
          ? Math.min(batchSize, maxRecords - yieldedCount)
          : batchSize;

      if (currentBatchSize <= 0) {
        break;
      }

      const records = (await this.recordManager.list({
        filter: this._filter as Record<string, unknown[]> | undefined,
        sort: this._sort.length > 0 ? this._sort : undefined,
        limit: currentBatchSize,
        offset,
        raw: false,
      })) as RecordWithId<T>[];

      for (const rec of records) {
        yield rec;
        yieldedCount++;
        if (maxRecords !== undefined && yieldedCount >= maxRecords) {
          return;
        }
      }

      if (records.length < currentBatchSize) {
        break;
      }

      offset += records.length;
    }
  }
}
