import { HttpTransport } from '../transport/HttpTransport';
import { ColumnPayload, TableSummary } from '../types/rest';

/**
 * Resource client for Grist Document Tables.
 *
 * Provides methods for inspecting and creating tables within a document.
 */
export class TablesResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Lists all tables in a document.
   *
   * @param docId - The unique document ID.
   * @returns An array of table summaries.
   */
  async list(docId: string): Promise<TableSummary[]> {
    const encodedDocId = encodeURIComponent(docId);
    const res = await this.transport.request<{ tables: TableSummary[] } | TableSummary[]>(
      `/docs/${encodedDocId}/tables`
    );

    if (Array.isArray(res)) {
      return res;
    }
    if (res && typeof res === 'object' && Array.isArray(res.tables)) {
      return res.tables;
    }
    return [];
  }

  /**
   * Creates one or more tables in a document.
   *
   * @param docId - The unique document ID.
   * @param payload - Payload containing table schemas and column definitions.
   */
  async create(
    docId: string,
    payload: { tables: { id?: string; columns: ColumnPayload[] }[] }
  ): Promise<void> {
    const encodedDocId = encodeURIComponent(docId);
    await this.transport.request<void>(`/docs/${encodedDocId}/tables`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}
