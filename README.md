# grist-api-sdk

A modern, type-safe, developer-friendly TypeScript SDK for the [Grist REST API](https://support.getgrist.com/api/).

[![npm version](https://img.shields.io/npm/v/grist-api-sdk.svg)](https://www.npmjs.com/package/grist-api-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Features

- **Layered Architecture**: Ergonomic fluent client (`client.doc(...).table(...).records`) with 1:1 typed raw REST resource escape hatches (`client.raw.*`).
- **End-to-End Type Safety**: Built-in generic typing for record schemas and an automated CLI tool (`grist-sdk typegen`) that generates TypeScript declarations (`.d.ts`) directly from live Grist tables.
- **Modern & Edge-Ready**: Built entirely on standard Web Fetch (`fetch`). Works in Node.js (18+), Bun, Deno, Next.js, Cloudflare Workers, Electron, and browsers. Zero mandatory HTTP dependencies.
- **Developer-Friendly Defaults**: Automatically flattens records into clean `{ id, ...fields }` objects while preserving numeric row IDs and supporting the raw `{ id, fields }` envelope via `{ raw: true }`.
- **Auto-Paginating Streaming**: Stream massive datasets row by row with `table.records.iterate()` using standard async iterators (`for await...of`).
- **Resilient by Default**: Automatic exponential backoff retries with decorrelated jitter for rate limits (HTTP 429 honoring `Retry-After`) and server errors (HTTP 5xx).
- **Comprehensive API Coverage**: First-class support for Records CRUD, Batch Upserting by key columns, SQLite Queries (`doc.sql`), File Attachments, Webhooks, Table/Column Schema Management, Workspaces, and Organizations.

---

## Installation

```bash
# pnpm
pnpm add grist-api-sdk

# npm
npm install grist-api-sdk

# yarn
yarn add grist-api-sdk

# bun
bun add grist-api-sdk
```

---

## Quick Start

### 1. Initialize the Client

```typescript
import { GristClient } from 'grist-api-sdk';

// Option A: Automatically resolves from environment variables
// Reads process.env.GRIST_API_KEY and process.env.GRIST_SERVER (defaults to https://docs.getgrist.com)
const grist = new GristClient();

// Option B: Explicit configuration
const grist = new GristClient({
  apiKey: 'YOUR_GRIST_API_KEY',
  serverUrl: 'https://docs.getgrist.com', // or team site: https://my-team.getgrist.com
});

// Option C: Self-hosted Grist instance
const grist = new GristClient({
  serverUrl: 'http://localhost:8484',
  apiKey: 'YOUR_GRIST_API_KEY',
});

// Option D: Directly from a Grist document URL (or doc ID)
const doc = GristClient.fromDocUrl('https://docs.getgrist.com/docId12345/Inventory', {
  apiKey: process.env.GRIST_API_KEY,
});
```

---

### 2. Type-Safe Table & Record CRUD

Define your row shape and interact with tables:

```typescript
interface Product {
  Title: string;
  Price: number;
  Stock: number;
  Category?: string;
  InStock?: boolean;
}

const doc = grist.doc('docId12345');
const products = doc.table<Product>('Products');

// --- List records (returns flattened { id, Title, Price, ... }[]) ---
const inStockProducts = await products.records.list({
  filter: { InStock: [true] },
  sort: ['-Price', 'Title'], // Prefix with '-' for descending sort
  limit: 50,
  offset: 0,
});

// --- Get a single record by row ID ---
// Throws GristNotFoundError if not found
const product = await products.records.get(142);
console.log(product.id, product.Title, product.Price);

// --- Create record(s) ---
// Single record
const newProduct = await products.records.create({
  Title: 'Mechanical Keyboard',
  Price: 99.99,
  Stock: 15,
  InStock: true,
});
console.log(`Created product with ID: ${newProduct.id}`);

// Batch create
const batchProducts = await products.records.create([
  { Title: 'Ergonomic Mouse', Price: 49.99, Stock: 30 },
  { Title: 'USB-C Cable', Price: 12.99, Stock: 100 },
]);

// --- Update a record ---
await products.records.update(142, {
  Price: 89.99,
  Stock: 10,
});

// --- Delete record(s) ---
await products.records.delete(142); // single ID
await products.records.delete([143, 144]); // array of IDs
```

---

### 3. Raw REST Escape Hatch

If you need the unmodified Grist REST payload envelope (`{ id, fields }`), pass `raw: true`:

```typescript
const rawRecords = await products.records.list({ raw: true });
// rawRecords -> [{ id: 142, fields: { Title: 'Mechanical Keyboard', Price: 99.99 } }]
console.log(rawRecords[0].fields.Title);
```

---

### 4. Streaming Large Tables (`iterate`)

Stream through thousands or millions of records efficiently without exhausting memory. `table.records.iterate()` automatically handles pagination under the hood:

```typescript
for await (const row of products.records.iterate({ batchSize: 200, filter: { InStock: [true] } })) {
  console.log(`Processing row #${row.id}: ${row.Title}`);
}
```

---

### 5. Batch Upserting with `keyCols`

Synchronize external data sources with Grist effortlessly. `upsert` matches existing rows by specified key columns and updates them, or inserts new rows if no match exists:

```typescript
await products.records.upsert(
  [
    { Title: 'Mechanical Keyboard', Price: 79.99, Stock: 25 },
    { Title: 'Gaming Mouse', Price: 39.99, Stock: 60 },
  ],
  {
    keyCols: ['Title'], // Column(s) to match existing records against
    onMany: 'first',    // Strategy when multiple records match: 'first' | 'none' | 'all'
  }
);
```

---

### 6. Direct SQLite Queries (`doc.sql`)

Grist documents are SQLite databases underneath. Query your documents directly using SQL:

```typescript
interface RevenueByCategory {
  Category: string;
  TotalRevenue: number;
  ItemCount: number;
}

const summary = await doc.sql<RevenueByCategory>(`
  SELECT Category, SUM(Price * Stock) as TotalRevenue, COUNT(*) as ItemCount
  FROM Products
  GROUP BY Category
  ORDER BY TotalRevenue DESC
`);

for (const row of summary) {
  console.log(`${row.Category}: $${row.TotalRevenue} across ${row.ItemCount} items`);
}
```

---

### 7. File Attachments

Upload and download files attached to Grist documents:

```typescript
import * as fs from 'node:fs/promises';

// 1. Upload file
const fileData = await fs.readFile('./invoice.pdf');
const [attachmentId] = await doc.attachments.upload({
  filename: 'invoice.pdf',
  data: fileData,
  contentType: 'application/pdf',
});

// 2. Attach to a record column (Grist attachment format: ['L', attachmentId])
await doc.table('Invoices').records.create({
  InvoiceNumber: 'INV-2026-001',
  Attachments: ['L', attachmentId],
});

// 3. Download file binary (ArrayBuffer)
const buffer = await doc.attachments.download(attachmentId);
await fs.writeFile('./downloaded_invoice.pdf', Buffer.from(buffer));

// 4. Retrieve attachment metadata
const meta = await doc.attachments.getMetadata(attachmentId);
console.log(meta.fileName, meta.fileSize, meta.timeUploaded);
```

---

### 8. Schema & Webhook Management

Inspect and manipulate tables, columns, and document webhooks programmatically:

```typescript
// Inspect tables
const tables = await doc.tables.list();

// Create new table
await doc.tables.create([
  {
    id: 'Suppliers',
    columns: [
      { id: 'Name', fields: { label: 'Supplier Name', type: 'Text' } },
      { id: 'Email', fields: { label: 'Contact Email', type: 'Text' } },
    ],
  },
]);

// Add columns to existing table
await doc.table('Products').columns.create({
  id: 'SKU',
  fields: {
    label: 'Stock Keeping Unit',
    type: 'Text',
  },
});

// Webhook management
const webhooks = await doc.webhooks.list();

const newWebhook = await doc.webhooks.create({
  name: 'Sync to CRM',
  url: 'https://api.mycrm.com/grist-events',
  eventTypes: ['add', 'update'],
  tableId: 'Products',
  enabled: true,
});

await doc.webhooks.update(newWebhook.id, { enabled: false });
await doc.webhooks.delete(newWebhook.id);
```

---

### 9. Low-Level REST Resources (`client.raw`)

For advanced use cases, the SDK exposes the complete, typed low-level REST API via `client.raw`:

```typescript
// Organizations
const orgs = await grist.raw.orgs.list();
const orgDetails = await grist.raw.orgs.get('my-team');
const workspaces = await grist.raw.orgs.getWorkspaces('my-team');

// Workspaces & Documents
const workspace = await grist.raw.workspaces.get(12);
const newDoc = await grist.raw.docs.create(12, { name: '2026 Financial Plan' });
await grist.raw.docs.delete(newDoc);
```

Available resources under `grist.raw`:
- `grist.raw.orgs`: Organizations management
- `grist.raw.workspaces`: Workspaces management
- `grist.raw.docs`: Document creation, metadata, and deletion
- `grist.raw.tables`: Table schema management
- `grist.raw.columns`: Column schema management
- `grist.raw.records`: Raw record CRUD and upserting
- `grist.raw.attachments`: Attachment upload, download, and metadata
- `grist.raw.webhooks`: Webhook lifecycle management
- `grist.raw.sql`: Direct SQL queries

---

## Typegen CLI (`grist-sdk typegen`)

Automatically introspect your live Grist document tables and generate a strongly typed TypeScript definitions file (`.d.ts`):

```bash
# Using pnpm / npx
pnpm exec grist-sdk typegen --doc <DOC_ID_OR_URL> --out src/types/grist.d.ts --api-key $GRIST_API_KEY

# Using bun
bun x grist-sdk typegen -d <DOC_ID> -o src/types/grist.d.ts
```

### CLI Flags

| Flag | Short | Description | Default |
| :--- | :--- | :--- | :--- |
| `--doc` | `-d` | Document ID or full Grist document URL | *(Required)* |
| `--out` | `-o` | Output file path (or `-` for stdout) | `grist.d.ts` |
| `--api-key` | `-k` | Grist API key | `$GRIST_API_KEY` |
| `--server` | `-s` | Grist server URL | `$GRIST_SERVER` or `https://docs.getgrist.com` |
| `--help` | `-h` | Display help screen | |

### Using Generated Types in Code

```typescript
import { GristClient } from 'grist-api-sdk';
import type { GristTables } from './types/grist';

const grist = new GristClient();
const doc = grist.doc('docId12345');

// Fully typed table based on your live schema!
const products = doc.table<GristTables['Products']>('Products');
const item = await products.records.get(1);
console.log(item.Title, item.Price);
```

### Column Type Mapping Matrix

| Grist Column Type | Generated TypeScript Type |
| :--- | :--- |
| `Text`, `String` | `string` |
| `Numeric`, `Int`, `Integer`, `ManualSortPos` | `number` |
| `Bool`, `Boolean` | `boolean` |
| `Date`, `DateTime` | `number` (timestamp in seconds) |
| `Choice` | `string` |
| `ChoiceList` | `string[]` |
| `Ref:<TableId>` | `number` (row ID of referenced table) |
| `RefList:<TableId>` | `number[]` (row IDs of referenced table) |
| `Attachments` | `number[]` (attachment IDs) |

---

## Error Handling & Retries

### Error Hierarchy

All SDK errors inherit from `GristError`:

```
Error
 └── GristError
      ├── GristNetworkError      # Fetch or network connection failures
      └── GristAPIError          # HTTP response errors
           ├── GristAuthError        # HTTP 401 Unauthorized
           ├── GristForbiddenError   # HTTP 403 Forbidden
           ├── GristNotFoundError   # HTTP 404 Not Found
           ├── GristValidationError  # HTTP 400 Bad Request / 422 Unprocessable
           └── GristRateLimitError   # HTTP 429 Too Many Requests (includes retryAfterSeconds)
```

Catch errors with fine-grained precision:

```typescript
import {
  GristNotFoundError,
  GristRateLimitError,
  GristValidationError,
  GristAPIError,
} from 'grist-api-sdk';

try {
  await products.records.get(9999);
} catch (error) {
  if (error instanceof GristNotFoundError) {
    console.error('Record does not exist:', error.message);
  } else if (error instanceof GristRateLimitError) {
    console.error(`Rate limited! Retry after ${error.retryAfterSeconds} seconds.`);
  } else if (error instanceof GristValidationError) {
    console.error('Validation error:', error.message, error.gristCode);
  } else if (error instanceof GristAPIError) {
    console.error(`API Error ${error.statusCode}:`, error.message);
  }
}
```

### Configurable Retry Engine

The client automatically retries transient errors (HTTP 429 rate limits and 5xx server errors) using exponential backoff with decorrelated jitter. When an HTTP 429 specifies a `Retry-After` header, it is automatically honored.

Customize or disable retry behavior:

```typescript
const grist = new GristClient({
  retry: {
    maxRetries: 5,     // Maximum number of retry attempts (default: 3)
    baseDelayMs: 500,  // Base delay before first retry in ms (default: 1000)
    maxDelayMs: 15000, // Maximum cap on backoff delay in ms (default: 30000)
  },
  // Or disable automatic retries completely:
  // retry: false,
});
```

---

## Configuration Reference

```typescript
export interface GristClientConfig {
  /**
   * Grist API Key. If omitted, uses process.env.GRIST_API_KEY.
   */
  apiKey?: string;
  /**
   * Base server URL. If omitted, uses process.env.GRIST_SERVER or defaults to 'https://docs.getgrist.com'.
   */
  serverUrl?: string;
  /**
   * Custom fetch implementation (defaults to global fetch).
   */
  fetch?: typeof fetch;
  /**
   * Custom HTTP headers included on all requests.
   */
  headers?: Record<string, string>;
  /**
   * Configurable retry options or false to disable retries.
   */
  retry?: RetryConfig | boolean;
}
```

---

## License

[MIT](LICENSE)
