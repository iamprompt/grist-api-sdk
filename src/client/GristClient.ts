import { GristValidationError } from '../errors';
import { AttachmentsResource } from '../resources/AttachmentsResource';
import { ColumnsResource } from '../resources/ColumnsResource';
import { DocsResource } from '../resources/DocsResource';
import { OrgsResource } from '../resources/OrgsResource';
import { RecordsResource } from '../resources/RecordsResource';
import { SqlResource } from '../resources/SqlResource';
import { TablesResource } from '../resources/TablesResource';
import { WebhooksResource } from '../resources/WebhooksResource';
import { WorkspacesResource } from '../resources/WorkspacesResource';
import { HttpTransport } from '../transport/HttpTransport';
import { DEFAULT_SERVER_URL, GristClientConfig } from '../types/config';
import { DocClient } from './DocClient';

/**
 * Extracts document ID and server URL from a Grist document URL or raw document ID.
 */
export function parseDocUrl(urlStr: string): { docId: string; serverUrl: string } {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new GristValidationError('A valid Grist document URL or ID must be provided');
  }

  const trimmed = urlStr.trim();
  if (!trimmed) {
    throw new GristValidationError('A valid Grist document URL or ID must be provided');
  }

  const reservedWords = new Set(['o', 'doc', 'd', 'api']);

  // If no protocol is provided, check whether it's a bare docId or a URL without scheme
  if (!trimmed.includes('://')) {
    if (trimmed.includes('/')) {
      return parseDocUrl(`https://${trimmed}`);
    }
    if (reservedWords.has(trimmed)) {
      throw new GristValidationError(`Invalid Grist document ID: "${trimmed}" is a reserved path`);
    }
    return {
      docId: trimmed,
      serverUrl: DEFAULT_SERVER_URL,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new GristValidationError(`Invalid URL: ${urlStr}`);
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length === 0) {
    throw new GristValidationError(`Invalid Grist document URL (missing document ID): ${urlStr}`);
  }

  let docId: string | undefined;
  let serverUrl = parsed.origin;

  // Handle /o/{org}/doc/{docId} or /o/{org}/d/{docId} or /o/{org}/{docId}
  if (parts[0] === 'o') {
    if (!parts[1]) {
      throw new GristValidationError(`Invalid Grist document URL (missing organization and document ID): ${urlStr}`);
    }
    const org = parts[1];
    serverUrl = `${parsed.origin}/o/${org}`;

    if (parts[2] === 'doc' || parts[2] === 'd') {
      docId = parts[3];
    } else {
      docId = parts[2];
    }
  } else if (parts[0] === 'doc' || parts[0] === 'd') {
    docId = parts[1];
  } else {
    docId = parts[0];
  }

  if (!docId || reservedWords.has(docId)) {
    throw new GristValidationError(`Invalid Grist document URL (missing document ID): ${urlStr}`);
  }

  return { docId, serverUrl };
}

/**
 * Main Grist API client.
 *
 * Provides a high-level fluent API via `.doc(...)` as well as direct access to low-level
 * REST resources via `.raw`.
 */
export class GristClient {
  private readonly transport: HttpTransport;

  /**
   * Low-level 1:1 REST API resources.
   */
  readonly raw: {
    orgs: OrgsResource;
    workspaces: WorkspacesResource;
    docs: DocsResource;
    tables: TablesResource;
    columns: ColumnsResource;
    records: RecordsResource;
    attachments: AttachmentsResource;
    webhooks: WebhooksResource;
    sql: SqlResource;
  };

  constructor(config?: GristClientConfig) {
    this.transport = new HttpTransport(config);

    this.raw = {
      orgs: new OrgsResource(this.transport),
      workspaces: new WorkspacesResource(this.transport),
      docs: new DocsResource(this.transport),
      tables: new TablesResource(this.transport),
      columns: new ColumnsResource(this.transport),
      records: new RecordsResource(this.transport),
      attachments: new AttachmentsResource(this.transport),
      webhooks: new WebhooksResource(this.transport),
      sql: new SqlResource(this.transport),
    };
  }

  /**
   * Returns a DocClient for interacting with a specific Grist document.
   */
  doc(docId: string): DocClient {
    return new DocClient(this.transport, docId, {
      tables: this.raw.tables,
      columns: this.raw.columns,
      records: this.raw.records,
      attachments: this.raw.attachments,
      webhooks: this.raw.webhooks,
      sql: this.raw.sql,
    });
  }

  /**
   * Creates a DocClient directly from a Grist document URL (or bare doc ID).
   *
   * Automatically extracts docId and team server URL (if present).
   */
  static fromDocUrl(
    url: string,
    config?: Omit<GristClientConfig, 'serverUrl'> & { serverUrl?: string }
  ): DocClient {
    const { docId, serverUrl } = parseDocUrl(url);
    const resolvedServerUrl = config?.serverUrl ?? serverUrl;
    const client = new GristClient({
      ...config,
      serverUrl: resolvedServerUrl,
    });
    return client.doc(docId);
  }
}
