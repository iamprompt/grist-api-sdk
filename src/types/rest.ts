/**
 * Access levels in Grist organizations, workspaces, and documents.
 */
export type AccessRole = 'owners' | 'editors' | 'viewers' | string;

/**
 * Summary of a Grist user.
 */
export interface UserSummary {
  id: number;
  name: string;
  picture?: string | null;
  email?: string;
}

/**
 * Organization summary information.
 */
export interface OrgSummary {
  id: number;
  name: string;
  domain: string | null;
  owner?: UserSummary | null;
  access?: AccessRole;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Detailed organization information.
 */
export interface OrgDetails extends OrgSummary {
  workspaces?: WorkspaceSummary[];
  billingAccount?: Record<string, unknown> | null;
}

/**
 * Workspace summary information.
 */
export interface WorkspaceSummary {
  id: number;
  name: string;
  access?: AccessRole;
  orgDomain?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Detailed workspace information including contained documents.
 */
export interface WorkspaceDetails extends WorkspaceSummary {
  docs: DocSummary[];
  org?: OrgSummary;
}

/**
 * Document summary information.
 */
export interface DocSummary {
  id: string;
  name: string;
  access?: AccessRole;
  isPinned?: boolean;
  urlId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Detailed document information including containing workspace and organization.
 */
export interface DocDetails extends DocSummary {
  workspace?: WorkspaceSummary & { org?: OrgSummary };
  aliases?: string[];
}

/**
 * Payload for creating or updating a workspace.
 */
export interface WorkspacePayload {
  name: string;
}

/**
 * Payload for creating a document.
 */
export interface DocCreatePayload {
  name: string;
}

/**
 * Payload for renaming or updating document metadata.
 */
export interface DocUpdatePayload {
  name?: string;
  isPinned?: boolean;
}

/**
 * Optional settings when removing/deleting documents or workspaces.
 */
export interface DeleteOptions {
  /**
   * If true, permanently delete instead of moving to trash.
   */
  permanent?: boolean;
}
