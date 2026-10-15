import { HttpTransport } from '../transport/HttpTransport';
import { OrgDetails, OrgSummary, WorkspaceSummary } from '../types/rest';

/**
 * Resource client for Grist Organizations.
 *
 * Provides methods for listing and inspecting organizations (team sites and personal sites)
 * and their associated workspaces.
 */
export class OrgsResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Lists all organizations accessible to the current authenticated user.
   */
  async list(): Promise<OrgSummary[]> {
    return await this.transport.request<OrgSummary[]>('/orgs');
  }

  /**
   * Gets details for a specific organization by ID or domain name.
   *
   * @param orgId - Organization ID (numeric) or domain name (string).
   */
  async get(orgId: string | number): Promise<OrgDetails> {
    const encodedOrgId = encodeURIComponent(String(orgId));
    return await this.transport.request<OrgDetails>(`/orgs/${encodedOrgId}`);
  }

  /**
   * Lists all workspaces belonging to a specific organization.
   *
   * @param orgId - Organization ID (numeric) or domain name (string).
   */
  async getWorkspaces(orgId: string | number): Promise<WorkspaceSummary[]> {
    const encodedOrgId = encodeURIComponent(String(orgId));
    return await this.transport.request<WorkspaceSummary[]>(`/orgs/${encodedOrgId}/workspaces`);
  }
}
