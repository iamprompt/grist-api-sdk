/**
 * Access levels in Grist organizations, workspaces, and documents.
 */
export type AccessRole = 'owners' | 'editors' | 'viewers' | (string & {});

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

/**
 * Detailed column configuration and attributes.
 */
export interface ColumnFields {
  label?: string;
  type?: string;
  isFormula?: boolean;
  formula?: string;
  widgetOptions?: string | Record<string, unknown>;
  untieColIdFromLabel?: boolean;
  summarySourceCol?: number;
  colRef?: number;
  [key: string]: unknown;
}

/**
 * Summary information for a table column.
 */
export interface ColumnSummary {
  id: string;
  fields?: ColumnFields;
  [key: string]: unknown;
}

/**
 * Payload for creating or updating a table column.
 */
export interface ColumnPayload {
  id?: string;
  fields?: ColumnFields;
  [key: string]: unknown;
}

/**
 * Summary information for a document table.
 */
export interface TableSummary {
  id: string;
  fields?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Payload for defining a table when creating tables.
 */
export interface TablePayload {
  id?: string;
  columns?: ColumnPayload[];
  [key: string]: unknown;
}

/**
 * Envelope containing a single record ID and its typed fields.
 */
export interface RecordEnvelope<TFields = Record<string, unknown>> {
  id: number;
  fields: TFields;
  [key: string]: unknown;
}

/**
 * Query options for filtering, sorting, and paginating table records.
 */
export interface RecordListOptions {
  /**
   * Filter matching records. Can be a record of column IDs to allowed values,
   * or a pre-serialized JSON filter string.
   */
  filter?: Record<string, unknown[]> | string;
  /**
   * Sort expression or list of column IDs. Prefix with '-' for descending order.
   */
  sort?: string | string[];
  /**
   * Maximum number of records to return.
   */
  limit?: number;
  /**
   * Number of records to skip for pagination.
   */
  offset?: number;
  /**
   * Whether to include hidden rows or columns.
   */
  hidden?: boolean;
}

/**
 * Response returned after creating records in a table.
 */
export interface RecordCreateResponse {
  records: { id: number }[];
}

/**
 * File input payload for uploading attachments.
 */
export interface UploadFileInput {
  filename: string;
  data: Uint8Array | Blob;
  contentType?: string;
}

/**
 * Metadata for a document attachment.
 */
export interface AttachmentMetadata {
  id?: number;
  fileName?: string;
  fileSize?: number;
  timeUploaded?: string;
  mimetype?: string;
  [key: string]: unknown;
}

/**
 * Configuration fields for a document webhook.
 */
export interface WebhookFields {
  name?: string;
  memo?: string;
  url: string;
  enabled?: boolean;
  eventTypes: (('add' | 'update') | (string & {}))[];
  tableId: string;
  isReadyColumn?: string | null;
  [key: string]: unknown;
}

/**
 * Summary information for a document webhook.
 */
export interface WebhookSummary {
  id: string;
  fields?: WebhookFields;
  name?: string;
  url?: string;
  tableId?: string;
  eventTypes?: string[];
  enabled?: boolean;
  isReadyColumn?: string | null;
  [key: string]: unknown;
}

/**
 * Payload for registering or subscribing a new webhook.
 */
export interface CreateWebhookPayload {
  fields?: WebhookFields;
  name?: string;
  memo?: string;
  url?: string;
  enabled?: boolean;
  eventTypes?: (('add' | 'update') | (string & {}))[];
  tableId?: string;
  isReadyColumn?: string | null;
  [key: string]: unknown;
}

/**
 * Payload for updating an existing webhook.
 */
export interface UpdateWebhookPayload {
  fields?: Partial<WebhookFields>;
  name?: string;
  memo?: string;
  url?: string;
  enabled?: boolean;
  eventTypes?: (('add' | 'update') | (string & {}))[];
  tableId?: string;
  isReadyColumn?: string | null;
  [key: string]: unknown;
}
