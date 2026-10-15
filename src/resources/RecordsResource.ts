import { HttpTransport } from '../transport/HttpTransport';
import { RecordCreateResponse, RecordEnvelope, RecordListOptions } from '../types/rest';

/**
 * Resource client for Grist Table Records.
 *
 * Provides methods for listing, creating, updating, upserting, and deleting records.
 */
export class RecordsResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Lists records from a table with optional filtering, sorting, and pagination.
   *
   * @param docId - The unique document ID.
   * @param tableId - The table identifier.
   * @param options - Query parameters including filter, sort, limit, and hidden.
   * @returns An array of record envelopes containing id and fields.
   */
  async list<TFields = Record<string, unknown>>(
    docId: string,
    tableId: string,
    options?: RecordListOptions
  ): Promise<RecordEnvelope<TFields>[]> {
    const encodedDocId = encodeURIComponent(docId);
    const encodedTableId = encodeURIComponent(tableId);

    const params: Record<string, unknown> = {};
    if (options?.filter !== undefined) {
      params.filter =
        typeof options.filter === 'object' && options.filter !== null
          ? JSON.stringify(options.filter)
          : options.filter;
    }
    if (options?.sort !== undefined) {
      params.sort = Array.isArray(options.sort)
        ? options.sort.join(',')
        : options.sort;
    }
    if (options?.limit !== undefined) {
      params.limit = options.limit;
    }
    if (options?.hidden !== undefined) {
      params.hidden = options.hidden;
    }

    const res = await this.transport.request<{ records: RecordEnvelope<TFields>[] } | RecordEnvelope<TFields>[]>(
      `/docs/${encodedDocId}/tables/${encodedTableId}/records`,
      { params: Object.keys(params).length > 0 ? params : undefined }
    );

    if (Array.isArray(res)) {
      return res;
    }
    if (res && typeof res === 'object' && Array.isArray(res.records)) {
      return res.records;
    }
    return [];
  }

  /**
   * Creates one or more records in a table.
   *
   * @param docId - The unique document ID.
   * @param tableId - The table identifier.
   * @param records - Array of objects with `fields`.
   * @returns Response containing created record IDs.
   */
  async create<TFields = Record<string, unknown>>(
    docId: string,
    tableId: string,
    records: { fields: TFields }[]
  ): Promise<RecordCreateResponse> {
    const encodedDocId = encodeURIComponent(docId);
    const encodedTableId = encodeURIComponent(tableId);

    const res = await this.transport.request<
      RecordCreateResponse | { records: (number | { id: number })[] } | (number | { id: number })[]
    >(`/docs/${encodedDocId}/tables/${encodedTableId}/records`, {
      method: 'POST',
      body: JSON.stringify({ records }),
    });

    if (Array.isArray(res)) {
      return {
        records: res.map((r) => (typeof r === 'number' ? { id: r } : r)),
      };
    }
    if (res && typeof res === 'object' && Array.isArray(res.records)) {
      return {
        records: res.records.map((r) => (typeof r === 'number' ? { id: r } : r)),
      };
    }
    return { records: [] };
  }

  /**
   * Updates existing records by ID.
   *
   * @param docId - The unique document ID.
   * @param tableId - The table identifier.
   * @param records - Array of records with `id` and partial `fields`.
   */
  async update<TFields = Record<string, unknown>>(
    docId: string,
    tableId: string,
    records: { id: number; fields: Partial<TFields> }[]
  ): Promise<void> {
    const encodedDocId = encodeURIComponent(docId);
    const encodedTableId = encodeURIComponent(tableId);

    await this.transport.request<void>(
      `/docs/${encodedDocId}/tables/${encodedTableId}/records`,
      {
        method: 'PATCH',
        body: JSON.stringify({ records }),
      }
    );
  }

  /**
   * Upserts records matching existing records based on unique key fields or creates new ones.
   *
   * @param docId - The unique document ID.
   * @param tableId - The table identifier.
   * @param records - Array of records with `fields`.
   * @param options - Upsert settings such as `onMany` ('first', 'none', 'all').
   */
  async upsert<TFields = Record<string, unknown>>(
    docId: string,
    tableId: string,
    records: { fields: TFields }[],
    options?: { onMany?: string }
  ): Promise<void> {
    const encodedDocId = encodeURIComponent(docId);
    const encodedTableId = encodeURIComponent(tableId);

    await this.transport.request<void>(
      `/docs/${encodedDocId}/tables/${encodedTableId}/records`,
      {
        method: 'PUT',
        body: JSON.stringify({ records }),
        params: options?.onMany ? { onMany: options.onMany } : undefined,
      }
    );
  }

  /**
   * Deletes one or more records by their numeric IDs.
   *
   * @param docId - The unique document ID.
   * @param tableId - The table identifier.
   * @param recordIds - Array of numeric record IDs to delete.
   */
  async delete(
    docId: string,
    tableId: string,
    recordIds: number[]
  ): Promise<void> {
    const encodedDocId = encodeURIComponent(docId);
    const encodedTableId = encodeURIComponent(tableId);

    await this.transport.request<void>(
      `/docs/${encodedDocId}/tables/${encodedTableId}/records/delete`,
      {
        method: 'POST',
        body: JSON.stringify(recordIds),
      }
    );
  }
}
