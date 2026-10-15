import { HttpTransport } from '../transport/HttpTransport';
import { DeleteOptions, DocCreatePayload, DocDetails, DocSummary } from '../types/rest';

/**
 * Resource client for Grist Documents.
 *
 * Provides methods for listing, inspecting, creating, renaming, pinning, and deleting documents.
 */
export class DocsResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Lists all documents accessible to the current authenticated user.
   */
  async list(): Promise<DocSummary[]> {
    return await this.transport.request<DocSummary[]>('/docs');
  }

  /**
   * Retrieves metadata and details for a specific document by its ID.
   *
   * @param docId - The unique document ID or URL ID.
   */
  async get(docId: string): Promise<DocDetails> {
    const encodedDocId = encodeURIComponent(docId);
    return await this.transport.request<DocDetails>(`/docs/${encodedDocId}`);
  }

  /**
   * Creates a new document inside a workspace.
   *
   * @param workspaceId - The numeric ID of the workspace where the document will be created.
   * @param payload - Document configuration (e.g. `{ name: 'My Document' }`).
   * @returns The unique string ID of the created document.
   */
  async create(workspaceId: number, payload: DocCreatePayload): Promise<string> {
    const encodedWorkspaceId = encodeURIComponent(String(workspaceId));
    const res = await this.transport.request<string | { id: string }>(
      `/workspaces/${encodedWorkspaceId}/docs`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    if (typeof res === 'string') {
      return res;
    }
    if (typeof res === 'object' && res !== null && 'id' in res) {
      return String((res as { id: string }).id);
    }
    return String(res);
  }

  /**
   * Renames an existing document.
   *
   * @param docId - The unique document ID.
   * @param newName - The new name for the document.
   */
  async rename(docId: string, newName: string): Promise<void> {
    const encodedDocId = encodeURIComponent(docId);
    await this.transport.request<void>(`/docs/${encodedDocId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName }),
    });
  }

  /**
   * Deletes a document by moving it to the trash (or permanently deleting it).
   *
   * @param docId - The unique document ID.
   * @param options - Optional deletion settings (e.g. `{ permanent: true }`).
   */
  async delete(docId: string, options?: DeleteOptions): Promise<void> {
    const encodedDocId = encodeURIComponent(docId);
    await this.transport.request<void>(`/docs/${encodedDocId}/remove`, {
      method: 'POST',
      params: options?.permanent ? { permanent: true } : undefined,
    });
  }

  /**
   * Pins a document so that it appears prominently at the top of workspace listings.
   *
   * @param docId - The unique document ID.
   */
  async pin(docId: string): Promise<void> {
    const encodedDocId = encodeURIComponent(docId);
    await this.transport.request<void>(`/docs/${encodedDocId}/pin`, {
      method: 'POST',
    });
  }

  /**
   * Unpins a document.
   *
   * @param docId - The unique document ID.
   */
  async unpin(docId: string): Promise<void> {
    const encodedDocId = encodeURIComponent(docId);
    await this.transport.request<void>(`/docs/${encodedDocId}/unpin`, {
      method: 'POST',
    });
  }
}
