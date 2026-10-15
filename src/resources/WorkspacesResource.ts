import { HttpTransport } from '../transport/HttpTransport';
import { DeleteOptions, WorkspaceDetails, WorkspacePayload } from '../types/rest';

/**
 * Resource client for Grist Workspaces.
 *
 * Provides methods for inspecting, creating, renaming, and deleting workspaces.
 */
export class WorkspacesResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Retrieves details of a workspace, including its list of documents.
   *
   * @param workspaceId - The numeric ID of the workspace.
   */
  async get(workspaceId: number): Promise<WorkspaceDetails> {
    const encodedId = encodeURIComponent(String(workspaceId));
    return await this.transport.request<WorkspaceDetails>(`/workspaces/${encodedId}`);
  }

  /**
   * Creates a new workspace inside the specified organization.
   *
   * @param orgId - Organization ID (numeric) or domain name (string).
   * @param payload - Workspace configuration (e.g. `{ name: 'My Workspace' }`).
   * @returns The numeric ID of the newly created workspace.
   */
  async create(orgId: string | number, payload: WorkspacePayload): Promise<number> {
    const encodedOrgId = encodeURIComponent(String(orgId));
    const res = await this.transport.request<number | { id: number }>(
      `/orgs/${encodedOrgId}/workspaces`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    if (typeof res === 'number') {
      return res;
    }
    if (typeof res === 'object' && res !== null && 'id' in res) {
      return Number((res as { id: number }).id);
    }
    return Number(res);
  }

  /**
   * Updates an existing workspace (e.g. renaming it).
   *
   * @param workspaceId - The numeric ID of the workspace.
   * @param payload - The fields to update (e.g. `{ name: 'New Name' }`).
   */
  async update(workspaceId: number, payload: WorkspacePayload): Promise<void> {
    const encodedId = encodeURIComponent(String(workspaceId));
    await this.transport.request<void>(`/workspaces/${encodedId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Deletes a workspace by moving it to the trash (or permanently deleting it).
   *
   * @param workspaceId - The numeric ID of the workspace.
   * @param options - Optional deletion settings (e.g. `{ permanent: true }`).
   */
  async delete(workspaceId: number, options?: DeleteOptions): Promise<void> {
    const encodedId = encodeURIComponent(String(workspaceId));
    await this.transport.request<void>(`/workspaces/${encodedId}/remove`, {
      method: 'POST',
      params: options?.permanent ? { permanent: true } : undefined,
    });
  }
}
