import { HttpTransport } from '../transport/HttpTransport';
import { ColumnPayload, ColumnSummary } from '../types/rest';

/**
 * Resource client for Grist Table Columns.
 *
 * Provides methods for inspecting and adding columns to a table.
 */
export class ColumnsResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Lists all columns in a specific table.
   *
   * @param docId - The unique document ID.
   * @param tableId - The table identifier.
   * @returns An array of column summaries.
   */
  async list(docId: string, tableId: string): Promise<ColumnSummary[]> {
    const encodedDocId = encodeURIComponent(docId);
    const encodedTableId = encodeURIComponent(tableId);
    const res = await this.transport.request<{ columns: ColumnSummary[] } | ColumnSummary[]>(
      `/docs/${encodedDocId}/tables/${encodedTableId}/columns`
    );

    if (Array.isArray(res)) {
      return res;
    }
    if (res && typeof res === 'object' && Array.isArray(res.columns)) {
      return res.columns;
    }
    return [];
  }

  /**
   * Creates one or more columns in a table.
   *
   * @param docId - The unique document ID.
   * @param tableId - The table identifier.
   * @param payload - Payload containing column specifications.
   */
  async create(
    docId: string,
    tableId: string,
    payload: { columns: ColumnPayload[] }
  ): Promise<void> {
    const encodedDocId = encodeURIComponent(docId);
    const encodedTableId = encodeURIComponent(tableId);
    await this.transport.request<void>(
      `/docs/${encodedDocId}/tables/${encodedTableId}/columns`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }
}
