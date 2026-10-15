import { HttpTransport } from '../transport/HttpTransport';

function unwrapRecord<T>(record: unknown): T {
  if (!record || typeof record !== 'object') {
    return record as T;
  }
  const rec = record as Record<string, unknown>;
  if ('fields' in rec && rec.fields && typeof rec.fields === 'object') {
    const fields = rec.fields as Record<string, unknown>;
    if ('id' in rec && fields.id === undefined) {
      return { id: rec.id, ...fields } as T;
    }
    return fields as T;
  }
  return record as T;
}

/**
 * Resource client for Grist SQL queries.
 *
 * Provides methods for executing SQLite read-only queries against a document.
 */
export class SqlResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Executes a read-only SQL query against the document.
   *
   * @param docId - The unique document ID.
   * @param sql - SQLite SELECT query string (must not end with semicolon).
   * @param params - Optional positional query parameters for '?' placeholders.
   * @returns Array of typed query results unwrapped from records.
   */
  async query<T = Record<string, unknown>>(
    docId: string,
    sql: string,
    params?: unknown[]
  ): Promise<T[]> {
    const encodedDocId = encodeURIComponent(docId);
    const body: { sql: string; args?: unknown[] } = { sql };
    if (params !== undefined) {
      body.args = params;
    }

    const res = await this.transport.request<{ records?: unknown[] } | unknown[]>(
      `/docs/${encodedDocId}/sql`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    if (Array.isArray(res)) {
      return res.map((item) => unwrapRecord<T>(item));
    }
    if (res && typeof res === 'object' && Array.isArray(res.records)) {
      return res.records.map((item) => unwrapRecord<T>(item));
    }
    return [];
  }
}
