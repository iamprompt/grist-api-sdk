import { describe, it, expect } from 'vitest';
import GristClientDefault, * as GristSDK from '../../src/index';
import type {
  GristClientConfig,
  RecordWithId,
  RecordEnvelope,
  RecordListOptions,
  TableSummary,
  ColumnSummary,
  UploadFileInput,
  AttachmentMetadata,
  WebhookSummary,
  CreateWebhookPayload,
  TypegenDocSchema,
} from '../../src/index';

describe('Public API Exports', () => {
  it('exports GristClient, errors, and utility classes', () => {
    // Client classes and functions
    expect(GristSDK.GristClient).toBeDefined();
    expect(typeof GristSDK.GristClient).toBe('function');
    expect(GristSDK.DocClient).toBeDefined();
    expect(GristSDK.TableClient).toBeDefined();
    expect(GristSDK.RecordManager).toBeDefined();
    expect(GristSDK.QueryBuilder).toBeDefined();
    expect(GristSDK.flattenRecord).toBeDefined();
    expect(GristSDK.parseDocUrl).toBeDefined();

    // Errors
    expect(GristSDK.GristError).toBeDefined();
    expect(GristSDK.GristAPIError).toBeDefined();
    expect(GristSDK.GristAuthError).toBeDefined();
    expect(GristSDK.GristForbiddenError).toBeDefined();
    expect(GristSDK.GristNotFoundError).toBeDefined();
    expect(GristSDK.GristRateLimitError).toBeDefined();
    expect(GristSDK.GristValidationError).toBeDefined();
    expect(GristSDK.GristNetworkError).toBeDefined();
    expect(GristSDK.normalizeGristError).toBeDefined();

    // Transport, retry, and adapters
    expect(GristSDK.HttpTransport).toBeDefined();
    expect(GristSDK.RetryHandler).toBeDefined();
    expect(GristSDK.defaultSleep).toBeDefined();
    expect(GristSDK.resolveConfig).toBeDefined();
    expect(GristSDK.DEFAULT_SERVER_URL).toBeDefined();
    expect(GristSDK.DEFAULT_RETRY_CONFIG).toBeDefined();
    expect(GristSDK.createAxiosFetch).toBeDefined();
    expect(typeof GristSDK.createAxiosFetch).toBe('function');
    expect(GristSDK.createKyFetch).toBeDefined();
    expect(typeof GristSDK.createKyFetch).toBe('function');
    expect(GristSDK.isAxiosInstance).toBeDefined();
    expect(typeof GristSDK.isAxiosInstance).toBe('function');

    // Low-level REST Resources
    expect(GristSDK.OrgsResource).toBeDefined();
    expect(GristSDK.WorkspacesResource).toBeDefined();
    expect(GristSDK.DocsResource).toBeDefined();
    expect(GristSDK.TablesResource).toBeDefined();
    expect(GristSDK.ColumnsResource).toBeDefined();
    expect(GristSDK.RecordsResource).toBeDefined();
    expect(GristSDK.AttachmentsResource).toBeDefined();
    expect(GristSDK.WebhooksResource).toBeDefined();
    expect(GristSDK.SqlResource).toBeDefined();

    // CLI & Typegen utilities
    expect(GristSDK.generateTypeScriptDeclarations).toBeDefined();
    expect(GristSDK.fetchDocSchema).toBeDefined();
    expect(GristSDK.mapGristTypeToTs).toBeDefined();
    expect(GristSDK.sanitizeInterfaceName).toBeDefined();
    expect(GristSDK.formatPropertyKey).toBeDefined();
    expect(GristSDK.runCli).toBeDefined();

    // Version
    expect(GristSDK.version).toBe('0.2.0');

    // Default export
    expect(GristClientDefault).toBe(GristSDK.GristClient);
  });

  it('allows instantiation of GristClient and error classes from public exports', () => {
    const client = new GristSDK.GristClient({ apiKey: 'test-key' });
    expect(client).toBeInstanceOf(GristSDK.GristClient);

    const defaultClient = new GristClientDefault({ apiKey: 'test-key-2' });
    expect(defaultClient).toBeInstanceOf(GristSDK.GristClient);

    const err = new GristSDK.GristNotFoundError('Not found');
    expect(err).toBeInstanceOf(GristSDK.GristError);
    expect(err).toBeInstanceOf(GristSDK.GristAPIError);
    expect(err).toBeInstanceOf(GristSDK.GristNotFoundError);
    expect(err.statusCode).toBe(404);
  });

  it('verifies type declarations can be imported and compile cleanly', () => {
    const config: GristClientConfig = { apiKey: 'key', serverUrl: 'https://example.com' };
    expect(config.apiKey).toBe('key');

    const item: RecordWithId<{ name: string }> = { id: 1, name: 'Alice' };
    expect(item.id).toBe(1);

    const envelope: RecordEnvelope<{ name: string }> = { id: 1, fields: { name: 'Alice' } };
    expect(envelope.fields.name).toBe('Alice');

    const listOpts: RecordListOptions = { limit: 10, offset: 0 };
    expect(listOpts.limit).toBe(10);

    const tableSum: TableSummary = { id: 'Table1' };
    expect(tableSum.id).toBe('Table1');

    const colSum: ColumnSummary = { id: 'Col1', fields: { type: 'Text' } };
    expect(colSum.id).toBe('Col1');

    const uploadInput: UploadFileInput = {
      filename: 'test.txt',
      data: new Uint8Array([1, 2, 3]),
    };
    expect(uploadInput.filename).toBe('test.txt');

    const meta: AttachmentMetadata = { id: 1, fileName: 'test.txt', fileSize: 3 };
    expect(meta.id).toBe(1);

    const hook: WebhookSummary = { id: 'hook1', url: 'https://webhook.site' };
    expect(hook.id).toBe('hook1');

    const createHook: CreateWebhookPayload = { url: 'https://webhook.site', eventTypes: ['add'] };
    expect(createHook.url).toBe('https://webhook.site');

    const schema: TypegenDocSchema = { tables: [] };
    expect(schema.tables).toEqual([]);
  });
});
