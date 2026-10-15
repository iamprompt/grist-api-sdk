import { AttachmentsResource } from '../resources/AttachmentsResource';
import { ColumnsResource } from '../resources/ColumnsResource';
import { RecordsResource } from '../resources/RecordsResource';
import { SqlResource } from '../resources/SqlResource';
import { TablesResource } from '../resources/TablesResource';
import { WebhooksResource } from '../resources/WebhooksResource';
import { HttpTransport } from '../transport/HttpTransport';
import {
  AttachmentMetadata,
  ColumnPayload,
  CreateWebhookPayload,
  TableSummary,
  UpdateWebhookPayload,
  UploadFileInput,
  WebhookSummary,
} from '../types/rest';
import { TableClient } from './TableClient';

/**
 * High-level document client for table, SQL, attachment, and webhook operations.
 */
export class DocClient {
  readonly id: string;

  /**
   * Document-scoped table schema operations.
   */
  readonly tables: {
    /**
     * Lists all tables in the document.
     */
    list: () => Promise<TableSummary[]>;
    /**
     * Creates one or more tables in the document.
     */
    create: (
      tables:
        | { tables: { id?: string; columns: ColumnPayload[] }[] }
        | { id?: string; columns: ColumnPayload[] }[]
        | { id?: string; columns: ColumnPayload[] }
    ) => Promise<void>;
  };

  /**
   * Document-scoped attachment operations.
   */
  readonly attachments: {
    /**
     * Uploads one or more attachments to the document.
     */
    upload: (file: UploadFileInput | UploadFileInput[]) => Promise<number[]>;
    /**
     * Downloads an attachment's binary content as an ArrayBuffer.
     */
    download: (attachmentId: number) => Promise<ArrayBuffer>;
    /**
     * Retrieves metadata for an attachment.
     */
    getMetadata: (attachmentId: number) => Promise<AttachmentMetadata>;
  };

  /**
   * Document-scoped webhook operations.
   */
  readonly webhooks: {
    /**
     * Lists all webhooks registered on this document.
     */
    list: () => Promise<WebhookSummary[]>;
    /**
     * Creates a new webhook on this document.
     */
    create: (payload: CreateWebhookPayload) => Promise<{ id: string }>;
    /**
     * Updates an existing webhook on this document.
     */
    update: (webhookId: string, payload: UpdateWebhookPayload) => Promise<void>;
    /**
     * Deletes a webhook from this document.
     */
    delete: (webhookId: string) => Promise<void>;
  };

  private readonly transport: HttpTransport;
  private readonly tablesResource: TablesResource;
  private readonly columnsResource: ColumnsResource;
  private readonly recordsResource: RecordsResource;
  private readonly attachmentsResource: AttachmentsResource;
  private readonly webhooksResource: WebhooksResource;
  private readonly sqlResource: SqlResource;

  constructor(
    transport: HttpTransport,
    docId: string,
    resources?: {
      tables?: TablesResource;
      columns?: ColumnsResource;
      records?: RecordsResource;
      attachments?: AttachmentsResource;
      webhooks?: WebhooksResource;
      sql?: SqlResource;
    }
  ) {
    this.id = docId;
    this.transport = transport;
    this.tablesResource = resources?.tables ?? new TablesResource(transport);
    this.columnsResource = resources?.columns ?? new ColumnsResource(transport);
    this.recordsResource = resources?.records ?? new RecordsResource(transport);
    this.attachmentsResource = resources?.attachments ?? new AttachmentsResource(transport);
    this.webhooksResource = resources?.webhooks ?? new WebhooksResource(transport);
    this.sqlResource = resources?.sql ?? new SqlResource(transport);

    this.tables = {
      list: () => this.tablesResource.list(this.id),
      create: (tables) => {
        let tableList: { id?: string; columns: ColumnPayload[] }[];
        if (
          tables &&
          typeof tables === 'object' &&
          'tables' in tables &&
          Array.isArray((tables as { tables: { id?: string; columns: ColumnPayload[] }[] }).tables)
        ) {
          tableList = (tables as { tables: { id?: string; columns: ColumnPayload[] }[] }).tables;
        } else if (Array.isArray(tables)) {
          tableList = tables;
        } else {
          tableList = [tables as { id?: string; columns: ColumnPayload[] }];
        }
        return this.tablesResource.create(this.id, { tables: tableList });
      },
    };

    this.attachments = {
      upload: (file) => this.attachmentsResource.upload(this.id, file),
      download: (attachmentId) => this.attachmentsResource.download(this.id, attachmentId),
      getMetadata: (attachmentId) => this.attachmentsResource.getMetadata(this.id, attachmentId),
    };

    this.webhooks = {
      list: () => this.webhooksResource.list(this.id),
      create: (payload) => this.webhooksResource.create(this.id, payload),
      update: (webhookId, payload) => this.webhooksResource.update(this.id, webhookId, payload),
      delete: (webhookId) => this.webhooksResource.delete(this.id, webhookId),
    };
  }

  /**
   * Returns a scoped TableClient for interacting with a specific table's records and columns.
   */
  table<T extends object = Record<string, unknown>>(tableId: string): TableClient<T> {
    return new TableClient<T>(this.transport, this.id, tableId, {
      records: this.recordsResource,
      columns: this.columnsResource,
    });
  }

  /**
   * Executes a read-only SQLite query against the document.
   */
  async sql<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]> {
    return this.sqlResource.query<T>(this.id, query, params);
  }
}
