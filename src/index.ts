export const version = '0.1.0';

// High-level client classes and helpers
export { GristClient, parseDocUrl } from './client/GristClient';
export { DocClient } from './client/DocClient';
export { TableClient } from './client/TableClient';
export {
  RecordManager,
  flattenRecord,
  QueryBuilder,
  type RecordWithId,
  type RecordListFluentOptions,
  type RecordUpsertOptions,
  type RecordIterateOptions,
} from './client/RecordManager';

// Error hierarchy & normalizer
export {
  GristError,
  GristAPIError,
  GristAuthError,
  GristForbiddenError,
  GristNotFoundError,
  GristRateLimitError,
  GristValidationError,
  GristNetworkError,
  normalizeGristError,
} from './errors';

// Transport, retry, and configuration
export { HttpTransport } from './transport/HttpTransport';
export { RetryHandler, defaultSleep } from './transport/RetryHandler';
export {
  DEFAULT_SERVER_URL,
  DEFAULT_RETRY_CONFIG,
  resolveConfig,
  type GristClientConfig,
  type ResolvedGristClientConfig,
  type RetryConfig,
  type ResolvedRetryConfig,
} from './types/config';

// Low-level REST API resources
export { OrgsResource } from './resources/OrgsResource';
export { WorkspacesResource } from './resources/WorkspacesResource';
export { DocsResource } from './resources/DocsResource';
export { TablesResource } from './resources/TablesResource';
export { ColumnsResource } from './resources/ColumnsResource';
export { RecordsResource } from './resources/RecordsResource';
export { AttachmentsResource } from './resources/AttachmentsResource';
export { WebhooksResource } from './resources/WebhooksResource';
export { SqlResource } from './resources/SqlResource';

// REST API models and data types
export type {
  AccessRole,
  UserSummary,
  OrgSummary,
  OrgDetails,
  WorkspaceSummary,
  WorkspaceDetails,
  DocSummary,
  DocDetails,
  WorkspacePayload,
  DocCreatePayload,
  DocUpdatePayload,
  DeleteOptions,
  ColumnFields,
  ColumnSummary,
  ColumnPayload,
  TableSummary,
  TablePayload,
  RecordEnvelope,
  RecordListOptions,
  RecordCreateResponse,
  UploadFileInput,
  AttachmentMetadata,
  WebhookFields,
  WebhookSummary,
  CreateWebhookPayload,
  UpdateWebhookPayload,
} from './types/rest';

// CLI and Typegen utilities
export {
  runCli,
  type CliOptions,
  generateTypeScriptDeclarations,
  fetchDocSchema,
  mapGristTypeToTs,
  sanitizeInterfaceName,
  formatPropertyKey,
  type TypegenColumnFields,
  type TypegenColumn,
  type TypegenTable,
  type TypegenDocSchema,
} from './cli';

import { GristClient } from './client/GristClient';
export default GristClient;
