# Grist TypeScript SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-dependency, type-safe, layered Node.js/TypeScript SDK and CLI for the Grist REST API supporting full CRUD, query building, batch sync, SQL, attachments, webhooks, and automatic type generation.

**Architecture:** A layered design where a standard-fetch HTTP transport with exponential backoff retry powers a low-level 1:1 REST resource layer, which in turn powers a high-level fluent client (`client.doc().table().records`) and an introspection CLI tool (`grist-sdk typegen`).

**Tech Stack:** TypeScript (strict mode), Node.js (>= 18), Web Fetch API, `tsup` (dual ESM/CJS build), `vitest` (test runner), Commander.js (CLI).

**Spec:** [docs/design-specification.md](file:///Users/iamprompt/Workspaces/github.com/iamprompt/grist-api-sdk/docs/design-specification.md)

## Global Constraints

- Runtime: Node.js >= 18.0.0, Bun, Deno, Edge, and modern browser environments.
- Zero mandatory runtime HTTP dependencies: use standard Web Fetch API (`fetch`, `Request`, `Response`, `Headers`).
- Output formats: Dual ESM (`dist/index.mjs`) and CommonJS (`dist/index.cjs`) with full TypeScript declarations (`dist/index.d.ts`).
- Error Handling: All non-2xx responses must throw structured instances of `GristError` or its subclasses.
- Code style: Strict TypeScript, no `any` in public APIs, clean error messages, full TDD coverage.

## Review Focus

1. **Non-JSON error response from server (e.g. 502 HTML page from reverse proxy):**
   - *Condition:* Server returns 502 with HTML content.
   - *Expectation:* Transport catches JSON parse failure and throws `GristAPIError` containing the raw response text without crashing. (Pinned to Task 3)
2. **Table ID or column names with spaces/special characters:**
   - *Condition:* Table ID like `Order Details` or column `Total (USD)`.
   - *Expectation:* Path segments and query parameters must be properly URI-encoded so requests do not fail with 400 Bad Request. (Pinned to Task 5 & Task 7)
3. **User record having a column explicitly named 'id':**
   - *Condition:* Record has field `{ id: 'custom-sku-123' }` alongside Grist row ID `42`.
   - *Expectation:* Record flattening retains row ID as `id` and provides access to fields or emits warning without corrupting the row ID; raw mode allows unambiguous access. (Pinned to Task 7)
4. **Empty batch operations (empty array passed to upsert or delete):**
   - *Condition:* `records.upsert([])` or `records.delete([])`.
   - *Expectation:* Immediate return of empty array without dispatching unnecessary HTTP requests. (Pinned to Task 7)
5. **Rate-limit (429) missing or malformed 'Retry-After' header:**
   - *Condition:* 429 response without `Retry-After` or with invalid string.
   - *Expectation:* Retry handler falls back safely to computed exponential backoff with jitter rather than `NaN` delay. (Pinned to Task 3)

---

### Task 1: Project Scaffolding & Tooling Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Test: `test/unit/scaffold.test.ts`

**Interfaces:**
- Consumes: None (root configuration)
- Produces: Project build pipeline (`pnpm run build`), test runner (`pnpm test`), and typechecker (`pnpm run typecheck`).

- [ ] **Step 1: Write test to verify test setup and build entry**

```typescript
// test/unit/scaffold.test.ts
import { describe, it, expect } from 'vitest';
import { version } from '../../src/index';

describe('Scaffolding', () => {
  it('exports a version string', () => {
    expect(version).toBeDefined();
    expect(typeof version).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/scaffold.test.ts`
Expected: FAIL (Cannot find module or vitest not configured)

- [ ] **Step 3: Implement project configuration & dummy entry point**

Create `package.json` with dual ESM/CJS exports, `tsconfig.json` with strict settings, `tsup.config.ts`, `vitest.config.ts`, and `src/index.ts` exporting `version`.
Install dev dependencies (`typescript`, `tsup`, `vitest`).

- [ ] **Step 4: Run test and build to verify it passes**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm test && PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm run build`
Expected: PASS and build generates `dist/` artifacts.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts vitest.config.ts src/index.ts test/unit/scaffold.test.ts
git commit -m "chore: scaffold project structure and build configuration"
```

---

### Task 2: Error Hierarchy & Error Normalizer

**Files:**
- Create: `src/errors/index.ts`
- Create: `src/transport/ErrorNormalizer.ts`
- Test: `test/unit/errors.test.ts`

**Interfaces:**
- Consumes: Standard JavaScript `Error`
- Produces:
  ```typescript
  export class GristError extends Error {}
  export class GristAPIError extends GristError {
    readonly statusCode: number;
    readonly gristCode?: string;
    readonly responseBody?: unknown;
    constructor(message: string, statusCode: number, responseBody?: unknown, gristCode?: string);
  }
  export class GristAuthError extends GristAPIError {}
  export class GristForbiddenError extends GristAPIError {}
  export class GristNotFoundError extends GristAPIError {}
  export class GristRateLimitError extends GristAPIError {
    readonly retryAfterSeconds?: number;
    constructor(message: string, statusCode: number, responseBody?: unknown, retryAfterSeconds?: number);
  }
  export class GristValidationError extends GristAPIError {}
  export class GristNetworkError extends GristError {
    readonly cause?: unknown;
    constructor(message: string, cause?: unknown);
  }

  export function normalizeGristError(statusCode: number, body: unknown, retryAfterHeader?: string | null): GristAPIError;
  ```

- [ ] **Step 1: Write the failing tests for error hierarchy and normalizer**

```typescript
// test/unit/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  GristAPIError,
  GristAuthError,
  GristNotFoundError,
  GristRateLimitError,
  normalizeGristError,
} from '../../src/errors';

describe('Error Normalizer', () => {
  it('normalizes 401 to GristAuthError', () => {
    const err = normalizeGristError(401, { error: 'Invalid API key' });
    expect(err).toBeInstanceOf(GristAuthError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Invalid API key');
  });

  it('normalizes 404 to GristNotFoundError', () => {
    const err = normalizeGristError(404, { error: 'Table not found' });
    expect(err).toBeInstanceOf(GristNotFoundError);
    expect(err.statusCode).toBe(404);
  });

  it('normalizes 429 to GristRateLimitError with parsed Retry-After', () => {
    const err = normalizeGristError(429, { error: 'Too Many Requests' }, '15');
    expect(err).toBeInstanceOf(GristRateLimitError);
    expect(err.statusCode).toBe(429);
    expect(err.retryAfterSeconds).toBe(15);
  });

  it('handles non-numeric or missing Retry-After without NaN', () => {
    const err = normalizeGristError(429, 'Rate limit hit', 'invalid-header');
    expect(err).toBeInstanceOf(GristRateLimitError);
    expect(err.retryAfterSeconds).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/errors.test.ts`
Expected: FAIL (Cannot find module '../../src/errors')

- [ ] **Step 3: Implement error classes and `normalizeGristError`**

Implement class hierarchy in `src/errors/index.ts` and the normalizer function in `src/transport/ErrorNormalizer.ts` (re-exported by errors).
Ensure string error bodies (like HTML or plain text) are safely extracted as messages.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/errors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/errors/index.ts src/transport/ErrorNormalizer.ts test/unit/errors.test.ts
git commit -m "feat: implement typed Grist error hierarchy and response normalizer"
```

---

### Task 3: HTTP Transport & Exponential Backoff Retry Engine

**Files:**
- Create: `src/types/config.ts`
- Create: `src/transport/RetryHandler.ts`
- Create: `src/transport/HttpTransport.ts`
- Test: `test/unit/transport.test.ts`

**Interfaces:**
- Consumes: `GristError`, `normalizeGristError` from Task 2
- Produces:
  ```typescript
  export interface GristClientConfig {
    apiKey?: string;
    serverUrl?: string;
    fetch?: typeof fetch;
    headers?: Record<string, string>;
    retry?: {
      maxRetries?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
    } | boolean;
  }

  export class HttpTransport {
    constructor(config?: GristClientConfig);
    request<T = unknown>(path: string, options?: RequestInit & { params?: Record<string, unknown> }): Promise<T>;
    requestRaw(path: string, options?: RequestInit & { params?: Record<string, unknown> }): Promise<Response>;
    getBaseUrl(): string;
  }
  ```

- [ ] **Step 1: Write failing tests for HttpTransport and retry behavior**

```typescript
// test/unit/transport.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HttpTransport } from '../../src/transport/HttpTransport';
import { GristRateLimitError, GristAPIError } from '../../src/errors';

describe('HttpTransport', () => {
  it('attaches Bearer token in Authorization header', async () => {
    let capturedHeaders: HeadersInit | undefined;
    const mockFetch = vi.fn().mockImplementation(async (url, init) => {
      capturedHeaders = init.headers;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const transport = new HttpTransport({ apiKey: 'secret-key', fetch: mockFetch });
    const res = await transport.request('/orgs');
    expect(res).toEqual({ success: true });
    expect((capturedHeaders as Record<string, string>)['Authorization']).toBe('Bearer secret-key');
  });

  it('retries on 429 and succeeds on subsequent attempt', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'Rate limit' }), {
          status: 429,
          headers: { 'Retry-After': '0', 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const transport = new HttpTransport({ fetch: mockFetch, retry: { maxRetries: 2, baseDelayMs: 10 } });
    const res = await transport.request('/test');
    expect(res).toEqual({ ok: true });
    expect(callCount).toBe(2);
  });

  it('handles 502 HTML error page without crashing JSON parser', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' }
      })
    );
    const transport = new HttpTransport({ fetch: mockFetch, retry: false });
    await expect(transport.request('/test')).rejects.toThrow(GristAPIError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/transport.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement HttpTransport and RetryHandler**

- `src/types/config.ts`: Export `GristClientConfig`, resolve default `serverUrl` (`https://docs.getgrist.com`), auto-detect `process.env.GRIST_API_KEY` and `process.env.GRIST_SERVER`.
- `src/transport/RetryHandler.ts`: Implement exponential backoff retry calculation with jitter and `Retry-After` parsing.
- `src/transport/HttpTransport.ts`: Implement URL joining, query parameter appending, header merging, error normalization, and retry wrapping.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/transport.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/config.ts src/transport/RetryHandler.ts src/transport/HttpTransport.ts test/unit/transport.test.ts
git commit -m "feat: implement HttpTransport with authentication and retry logic"
```

---

### Task 4: Low-Level Core REST Resources (Orgs, Workspaces, Docs)

**Files:**
- Create: `src/types/rest.ts`
- Create: `src/resources/OrgsResource.ts`
- Create: `src/resources/WorkspacesResource.ts`
- Create: `src/resources/DocsResource.ts`
- Test: `test/unit/resources-docs-workspaces.test.ts`

**Interfaces:**
- Consumes: `HttpTransport`
- Produces:
  ```typescript
  export class OrgsResource {
    constructor(transport: HttpTransport);
    list(): Promise<OrgSummary[]>;
    get(orgId: string | number): Promise<OrgDetails>;
    getWorkspaces(orgId: string | number): Promise<WorkspaceSummary[]>;
  }

  export class WorkspacesResource {
    constructor(transport: HttpTransport);
    get(workspaceId: number): Promise<WorkspaceDetails>;
    create(orgId: string | number, payload: { name: string }): Promise<number>;
    update(workspaceId: number, payload: { name: string }): Promise<void>;
    delete(workspaceId: number): Promise<void>;
  }

  export class DocsResource {
    constructor(transport: HttpTransport);
    list(): Promise<DocSummary[]>;
    get(docId: string): Promise<DocDetails>;
    create(workspaceId: number, payload: { name: string }): Promise<string>;
    rename(docId: string, newName: string): Promise<void>;
    delete(docId: string): Promise<void>;
    pin(docId: string): Promise<void>;
    unpin(docId: string): Promise<void>;
  }
  ```

- [ ] **Step 1: Write failing tests for Orgs, Workspaces, and Docs resources**

```typescript
// test/unit/resources-docs-workspaces.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HttpTransport } from '../../src/transport/HttpTransport';
import { DocsResource } from '../../src/resources/DocsResource';

describe('DocsResource', () => {
  it('calls correct endpoint to create a document', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify('newDocId123'), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    const transport = new HttpTransport({ fetch: mockFetch });
    const docs = new DocsResource(transport);
    const docId = await docs.create(42, { name: 'My Test Doc' });

    expect(docId).toBe('newDocId123');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/42/docs'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/resources-docs-workspaces.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement OrgsResource, WorkspacesResource, DocsResource, and types**

Implement models in `src/types/rest.ts` and resource methods in `src/resources/`. Ensure all paths match Grist OpenAPI spec.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/resources-docs-workspaces.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/rest.ts src/resources/OrgsResource.ts src/resources/WorkspacesResource.ts src/resources/DocsResource.ts test/unit/resources-docs-workspaces.test.ts
git commit -m "feat: implement Orgs, Workspaces, and Docs REST resources"
```

---

### Task 5: Low-Level Schema, Record & SQL Resources

**Files:**
- Create: `src/resources/TablesResource.ts`
- Create: `src/resources/ColumnsResource.ts`
- Create: `src/resources/RecordsResource.ts`
- Create: `src/resources/SqlResource.ts`
- Test: `test/unit/resources-records-schema.test.ts`

**Interfaces:**
- Consumes: `HttpTransport`
- Produces:
  ```typescript
  export class TablesResource {
    list(docId: string): Promise<TableSummary[]>;
    create(docId: string, payload: { tables: { id: string; columns: ColumnPayload[] }[] }): Promise<void>;
  }

  export class ColumnsResource {
    list(docId: string, tableId: string): Promise<ColumnSummary[]>;
    create(docId: string, tableId: string, payload: { columns: ColumnPayload[] }): Promise<void>;
  }

  export class RecordsResource {
    list<TFields = Record<string, unknown>>(docId: string, tableId: string, options?: RecordListOptions): Promise<RecordEnvelope<TFields>[]>;
    create<TFields = Record<string, unknown>>(docId: string, tableId: string, records: { fields: TFields }[]): Promise<RecordCreateResponse>;
    update<TFields = Record<string, unknown>>(docId: string, tableId: string, records: { id: number; fields: Partial<TFields> }[]): Promise<void>;
    upsert<TFields = Record<string, unknown>>(docId: string, tableId: string, records: { fields: TFields }[], options?: { onMany?: string }): Promise<void>;
    delete(docId: string, tableId: string, recordIds: number[]): Promise<void>;
  }

  export class SqlResource {
    query<T = Record<string, unknown>>(docId: string, sql: string, params?: unknown[]): Promise<T[]>;
  }
  ```

- [ ] **Step 1: Write failing tests for Records, Tables, Columns, and SQL resources**

```typescript
// test/unit/resources-records-schema.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HttpTransport } from '../../src/transport/HttpTransport';
import { RecordsResource } from '../../src/resources/RecordsResource';
import { SqlResource } from '../../src/resources/SqlResource';

describe('RecordsResource & SqlResource', () => {
  it('properly URI encodes table IDs containing spaces or symbols', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ records: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    const transport = new HttpTransport({ fetch: mockFetch });
    const records = new RecordsResource(transport);
    await records.list('doc1', 'Order Details');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc1/tables/Order%20Details/records'),
      expect.any(Object)
    );
  });

  it('posts SQL queries to /docs/{docId}/sql', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ records: [{ id: 1, count: 5 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    const transport = new HttpTransport({ fetch: mockFetch });
    const sql = new SqlResource(transport);
    const result = await sql.query('doc1', 'SELECT count(*) FROM Items');

    expect(result).toEqual([{ id: 1, count: 5 }]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc1/sql'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ sql: 'SELECT count(*) FROM Items' }) })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/resources-records-schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement TablesResource, ColumnsResource, RecordsResource, and SqlResource**

Implement endpoints using `encodeURIComponent` for all table IDs, column IDs, and doc IDs. Support query filters serialized via `JSON.stringify`.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/resources-records-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/resources/TablesResource.ts src/resources/ColumnsResource.ts src/resources/RecordsResource.ts src/resources/SqlResource.ts test/unit/resources-records-schema.test.ts
git commit -m "feat: implement Tables, Columns, Records, and SQL REST resources"
```

---

### Task 6: Low-Level Attachments & Webhooks Resources

**Files:**
- Create: `src/resources/AttachmentsResource.ts`
- Create: `src/resources/WebhooksResource.ts`
- Test: `test/unit/resources-webhooks-attachments.test.ts`

**Interfaces:**
- Consumes: `HttpTransport`
- Produces:
  ```typescript
  export class AttachmentsResource {
    upload(docId: string, file: { filename: string; data: Uint8Array | Blob; contentType?: string }): Promise<number[]>;
    download(docId: string, attachmentId: number): Promise<ArrayBuffer>;
    getMetadata(docId: string, attachmentId: number): Promise<AttachmentMetadata>;
  }

  export class WebhooksResource {
    list(docId: string): Promise<WebhookSummary[]>;
    create(docId: string, payload: CreateWebhookPayload): Promise<{ id: string }>;
    update(docId: string, webhookId: string, payload: UpdateWebhookPayload): Promise<void>;
    delete(docId: string, webhookId: string): Promise<void>;
  }
  ```

- [ ] **Step 1: Write failing tests for Attachments and Webhooks resources**

```typescript
// test/unit/resources-webhooks-attachments.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HttpTransport } from '../../src/transport/HttpTransport';
import { AttachmentsResource } from '../../src/resources/AttachmentsResource';
import { WebhooksResource } from '../../src/resources/WebhooksResource';

describe('Attachments & Webhooks', () => {
  it('uploads file using FormData', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([101]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    const transport = new HttpTransport({ fetch: mockFetch });
    const atts = new AttachmentsResource(transport);
    const ids = await atts.upload('doc1', {
      filename: 'file.txt',
      data: new TextEncoder().encode('hello'),
      contentType: 'text/plain'
    });

    expect(ids).toEqual([101]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/docs/doc1/attachments'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/resources-webhooks-attachments.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement AttachmentsResource and WebhooksResource**

Support standard `FormData` for uploads and `arrayBuffer()` for binary downloads.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/resources-webhooks-attachments.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/resources/AttachmentsResource.ts src/resources/WebhooksResource.ts test/unit/resources-webhooks-attachments.test.ts
git commit -m "feat: implement Attachments and Webhooks REST resources"
```

---

### Task 7: High-Level Fluent Client (GristClient, DocClient, TableClient, RecordManager)

**Files:**
- Create: `src/client/RecordManager.ts`
- Create: `src/client/TableClient.ts`
- Create: `src/client/DocClient.ts`
- Create: `src/client/GristClient.ts`
- Test: `test/unit/fluent-client.test.ts`

**Interfaces:**
- Consumes: All resources from Tasks 4, 5, 6
- Produces:
  ```typescript
  export class GristClient {
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
    constructor(config?: GristClientConfig);
    static fromDocUrl(url: string, config?: Omit<GristClientConfig, 'serverUrl'>): DocClient;
    doc(docId: string): DocClient;
  }

  export class DocClient {
    readonly id: string;
    table<T extends Record<string, unknown> = Record<string, unknown>>(tableId: string): TableClient<T>;
    sql<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
  }

  export class TableClient<T extends Record<string, unknown>> {
    readonly tableId: string;
    readonly records: RecordManager<T>;
  }

  export class RecordManager<T extends Record<string, unknown>> {
    list(options?: { filter?: Partial<Record<keyof T, unknown[]>>; sort?: (keyof T | string)[]; limit?: number; raw?: boolean }): Promise<(RecordWithId<T>)[]>;
    get(recordId: number): Promise<RecordWithId<T>>;
    create(data: T | T[]): Promise<RecordWithId<T> | RecordWithId<T>[]>;
    update(recordId: number, data: Partial<T>): Promise<void>;
    upsert(records: T[], options: { keyCols: (keyof T)[] }): Promise<void>;
    delete(recordIds: number | number[]): Promise<void>;
    iterate(options?: { batchSize?: number; filter?: Partial<Record<keyof T, unknown[]>> }): AsyncIterableIterator<RecordWithId<T>>;
  }
  ```

- [ ] **Step 1: Write failing tests for fluent client and record transformation**

```typescript
// test/unit/fluent-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GristClient } from '../../src/client/GristClient';

interface Product {
  Name: string;
  Price: number;
}

describe('GristClient Fluent API', () => {
  it('flattens records by default: { id: 1, Name: "Book", Price: 10 }', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        records: [{ id: 1, fields: { Name: 'Book', Price: 10 } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const grist = new GristClient({ fetch: mockFetch });
    const records = await grist.doc('doc1').table<Product>('Products').records.list();

    expect(records).toEqual([{ id: 1, Name: 'Book', Price: 10 }]);
  });

  it('returns raw envelope when raw: true is passed', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        records: [{ id: 1, fields: { Name: 'Book', Price: 10 } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const grist = new GristClient({ fetch: mockFetch });
    const records = await grist.doc('doc1').table<Product>('Products').records.list({ raw: true });

    expect(records).toEqual([{ id: 1, fields: { Name: 'Book', Price: 10 } }]);
  });

  it('safely no-ops on empty array for batch upsert', async () => {
    const mockFetch = vi.fn();
    const grist = new GristClient({ fetch: mockFetch });
    await grist.doc('doc1').table<Product>('Products').records.upsert([], { keyCols: ['Name'] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('creates DocClient from doc URL via GristClient.fromDocUrl', () => {
    const doc = GristClient.fromDocUrl('https://docs.getgrist.com/123456789abc/My-Doc');
    expect(doc.id).toBe('123456789abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/fluent-client.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement RecordManager, TableClient, DocClient, and GristClient**

- Implement flattening/unflattening functions.
- Implement `iterate()` using `limit` and `offset` paging until fewer records than `batchSize` are returned.
- Implement `fromDocUrl` extracting docId from Grist URL formats (both standard and team domains).

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/fluent-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/RecordManager.ts src/client/TableClient.ts src/client/DocClient.ts src/client/GristClient.ts test/unit/fluent-client.test.ts
git commit -m "feat: implement high-level fluent client and RecordManager"
```

---

### Task 8: CLI Type Generation Tool (`grist-typegen`)

**Files:**
- Create: `src/cli/typegen.ts`
- Create: `src/cli/index.ts`
- Create: `bin/grist-sdk.js`
- Test: `test/unit/typegen.test.ts`

**Interfaces:**
- Consumes: `GristClient`, `TablesResource`, `ColumnsResource`
- Produces: Executable CLI binary generating TypeScript declarations (`.d.ts`) from live Grist table schemas.

- [ ] **Step 1: Write failing test for type generator logic**

```typescript
// test/unit/typegen.test.ts
import { describe, it, expect } from 'vitest';
import { generateTypeScriptDeclarations } from '../../src/cli/typegen';

describe('Typegen Generator', () => {
  it('maps Grist column types to TypeScript types correctly', () => {
    const schema = {
      tables: [
        {
          id: 'Users',
          columns: [
            { id: 'Name', fields: { type: 'Text' } },
            { id: 'Age', fields: { type: 'Int' } },
            { id: 'IsActive', fields: { type: 'Bool' } },
            { id: 'Tags', fields: { type: 'ChoiceList' } },
          ]
        }
      ]
    };

    const output = generateTypeScriptDeclarations(schema);
    expect(output).toContain('export interface UsersRow {');
    expect(output).toContain('Name: string;');
    expect(output).toContain('Age: number;');
    expect(output).toContain('IsActive: boolean;');
    expect(output).toContain('Tags: string[];');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/typegen.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement type generator and CLI runner**

- `src/cli/typegen.ts`: Complete type mapping table (Text -> string, Numeric/Int -> number, Bool -> boolean, Choice -> string, ChoiceList -> string[], Ref:X -> number, RefList:X -> number[], Attachments -> number[]).
- `src/cli/index.ts`: Parse CLI flags (`--doc`, `--out`, `--api-key`, `--server`).
- `bin/grist-sdk.js`: Executable node entrypoint with shebang.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/typegen.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/typegen.ts src/cli/index.ts bin/grist-sdk.js test/unit/typegen.test.ts
git commit -m "feat: implement CLI type generator for Grist documents"
```

---

### Task 9: Public API Exports, Packaging Verification & Documentation

**Files:**
- Modify: `src/index.ts`
- Create: `README.md`
- Test: `test/unit/exports.test.ts`

**Interfaces:**
- Consumes: All modules
- Produces: Unified public export interface, complete documentation, verified NPM package build.

- [ ] **Step 1: Write test to verify public API exports**

```typescript
// test/unit/exports.test.ts
import { describe, it, expect } from 'vitest';
import * as GristSDK from '../../src/index';

describe('Public API Exports', () => {
  it('exports GristClient, errors, and utility classes', () => {
    expect(GristSDK.GristClient).toBeDefined();
    expect(GristSDK.GristAPIError).toBeDefined();
    expect(GristSDK.GristRateLimitError).toBeDefined();
    expect(GristSDK.HttpTransport).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm exec vitest run test/unit/exports.test.ts`
Expected: FAIL or PASS depending on exports in `src/index.ts`.

- [ ] **Step 3: Update `src/index.ts` and write `README.md`**

Export all public classes, types, and error definitions from `src/index.ts`.
Write comprehensive `README.md` covering:
- Installation
- Quick Start (Record CRUD, Upsert, Querying)
- Typegen CLI usage
- Direct SQL querying
- Error handling & retries
- Raw REST escape hatch

- [ ] **Step 4: Full project verification**

Run:
```bash
PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm run build
PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm test
PATH="/usr/local/bin:/Users/iamprompt/.gemini/antigravity/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/iamprompt/.gemini/config/plugins/antigravity-cli-wakatime/bin" pnpm run typecheck
```
Expected: All build artifacts generated, all tests pass, zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts README.md test/unit/exports.test.ts
git commit -m "docs: complete README and finalize public SDK exports"
```
