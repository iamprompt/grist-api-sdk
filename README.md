# grist-api-sdk

A modern, type-safe, developer-friendly TypeScript/Node.js SDK for the [Grist REST API](https://support.getgrist.com/api/).

[![npm version](https://img.shields.io/npm/v/grist-api-sdk.svg)](https://www.npmjs.com/package/grist-api-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Setup & Authentication](#setup--authentication)
  - [1. Obtain Your Grist API Key](#1-obtain-your-grist-api-key)
  - [2. Locate Your Document & Table IDs](#2-locate-your-document--table-ids)
  - [3. Configure Environment Variables](#3-configure-environment-variables)
- [Quick Start](#quick-start)
- [Client Initialization Options](#client-initialization-options)
- [Core Usage Guide](#core-usage-guide)
  - [Type-Safe Record CRUD](#type-safe-record-crud)
  - [Batch Operations (Create, Update, Delete)](#batch-operations-create-update-delete)
  - [Batch Upsert with Key Columns](#batch-upsert-with-key-columns)
  - [Chainable Query Builder](#chainable-query-builder)
  - [Streaming Records with Async Iteration](#streaming-records-with-async-iteration)
  - [Direct SQLite Queries (`doc.sql`)](#direct-sqlite-queries-docsql)
  - [File Attachments (Upload & Download)](#file-attachments-upload--download)
  - [Schema & Webhook Management](#schema--webhook-management)
  - [Raw REST API Resources (`client.raw`)](#raw-rest-api-resources-clientraw)
- [CLI Type Generation (`grist-sdk typegen`)](#cli-type-generation-grist-sdk-typegen)
  - [Adding Typegen to `package.json`](#adding-typegen-to-packagejson)
  - [Column Type Mapping Matrix](#column-type-mapping-matrix)
- [Framework Integration Examples](#framework-integration-examples)
  - [Next.js App Router (Server Component)](#nextjs-app-router-server-component)
  - [Express / Fastify REST Endpoint](#express--fastify-rest-endpoint)
- [Custom HTTP Clients & Adapters (Ky, Axios, Proxies)](#custom-http-clients--adapters-ky-axios-proxies)
- [Error Handling & Automatic Retries](#error-handling--automatic-retries)
- [Security & Best Practices](#security--best-practices)
- [API Reference Summary](#api-reference-summary)
- [License](#license)

---

## Features

- **Layered Architecture**: Ergonomic fluent client (`client.doc(...).table(...).records`) with 1:1 typed raw REST resource escape hatches (`client.raw.*`).
- **End-to-End Type Safety**: Built-in generic typing for record schemas and an automated CLI tool (`grist-sdk typegen`) that generates TypeScript declarations (`.d.ts`) directly from live Grist tables.
- **Modern & Edge-Ready**: Built entirely on standard Web Fetch (`fetch`). Works in Node.js (18+), Bun, Deno, Next.js, Cloudflare Workers, Electron, and browsers. Zero mandatory runtime dependencies.
- **Developer-Friendly Defaults**: Automatically flattens records into clean `{ id, ...fields }` objects while preserving numeric row IDs and supporting the raw `{ id, fields }` envelope via `{ raw: true }`.
- **Chainable Query Builder**: Fluent API with `.where()`, `.sort()`, `.limit()`, and `.offset()` for readable querying.
- **Streaming Async Iterator**: Stream datasets row by row with `table.records.iterate()` using standard async iterators (`for await...of`).
- **Resilient by Default**: Automatic exponential backoff retries with decorrelated jitter for rate limits (HTTP 429 honoring `Retry-After`) and server errors (HTTP 5xx).
- **Comprehensive API Coverage**: First-class support for Records CRUD, Batch Upserting by key columns, SQLite Queries (`doc.sql`), File Attachments, Webhooks, Table/Column Schema Management, Workspaces, and Organizations.

---

## Installation

```bash
# Using pnpm
pnpm add grist-api-sdk

# Using npm
npm install grist-api-sdk

# Using yarn
yarn add grist-api-sdk

# Using bun
bun add grist-api-sdk
```

---

## Setup & Authentication

### 1. Obtain Your Grist API Key

1. Log into your Grist account (on [docs.getgrist.com](https://docs.getgrist.com) or your self-hosted instance).
2. Click your profile avatar in the top-right corner and select **Profile Settings**.
3. Scroll down to the **API Key** section.
4. Click **Create API Key** (or copy your existing key).

> [!IMPORTANT]
> Keep your API key secure! Never commit it to version control or expose it in client-side browser bundles.

### 2. Locate Your Document & Table IDs

- **Document ID**: Open your document in Grist and inspect the browser URL:
  ```
  https://docs.getgrist.com/w5SN1gn86GzoTzdvP1DncR/My-Document-Name
  ```
  The string between the domain and title (`w5SN1gn86GzoTzdvP1DncR`) is your **Document ID**.
  *(Alternatively, you can pass the entire URL directly to `GristClient.fromDocUrl(...)`!)*

- **Table ID**: Inside your document, the name on the table tab or under the **Raw Data** screen is the **Table ID** (e.g. `Employees`, `Table1`, `Inventory`).

### 3. Configure Environment Variables

Create a `.env` file in the root of your project:

```ini
# Required: Your Grist API Key
GRIST_API_KEY=a007b819c9e8e2...

# Optional: Grist Server URL (defaults to https://docs.getgrist.com)
# For team sites: https://<my-team>.getgrist.com
# For self-hosted: https://grist.mycompany.com or http://localhost:8484
GRIST_SERVER=https://docs.getgrist.com
```

Add `.env` to your `.gitignore`:

```bash
echo ".env" >> .gitignore
```

---

## Quick Start

```typescript
import { GristClient } from 'grist-api-sdk';

// Automatically reads GRIST_API_KEY and GRIST_SERVER from process.env
const grist = new GristClient();

// Connect to a document and table
const doc = grist.doc('w5SN1gn86GzoTzdvP1DncR');
const employees = doc.table('Employees');

// 1. Fetch records
const allEmployees = await employees.records.list();
console.log('Employees:', allEmployees);

// 2. Add a new record
const newEmployee = await employees.records.create({
  Name: 'Alex Morgan',
  Department: 'Engineering',
  Salary: 120000,
  IsActive: true,
});
console.log(`Created employee ID: ${newEmployee.id}`);
```

---

## Client Initialization Options

### Option A: Ambient Environment Variables (Recommended)

When `GRIST_API_KEY` and optional `GRIST_SERVER` are set in the environment:

```typescript
import { GristClient } from 'grist-api-sdk';

const grist = new GristClient();
```

### Option B: Explicit Configuration

```typescript
const grist = new GristClient({
  apiKey: 'YOUR_API_KEY',
  serverUrl: 'https://my-team.getgrist.com', // or self-hosted 'https://grist.example.com'
});
```

### Option C: Directly from a Grist Document URL

The SDK can automatically extract both the **Document ID** and the **Team Server URL** directly from a browser URL:

```typescript
import { GristClient } from 'grist-api-sdk';

// Handles cloud URLs, team sites, and custom domains
const doc = GristClient.fromDocUrl(
  'https://my-team.getgrist.com/w5SN1gn86GzoTzdvP1DncR/Payroll',
  { apiKey: process.env.GRIST_API_KEY }
);

const records = await doc.table('Employees').records.list();
```

### Option D: Custom Fetch or Custom Headers

```typescript
const grist = new GristClient({
  apiKey: process.env.GRIST_API_KEY,
  headers: {
    'User-Agent': 'MyApp/1.0.0',
    'X-Custom-Trace-Id': 'req-12345',
  },
  // Optionally provide custom fetch (e.g., undici, mock, or instrumented fetch)
  fetch: globalThis.fetch,
});
```

---

## Core Usage Guide

### Type-Safe Record CRUD

Define your row shape with a TypeScript interface for full autocompletion and compile-time validation:

```typescript
interface Product {
  Title: string;
  Price: number;
  Stock: number;
  Category?: string;
  InStock?: boolean;
}

const doc = grist.doc('doc123');
const products = doc.table<Product>('Products');

// --- List records (returns flattened { id, Title, Price, ... }[]) ---
const items = await products.records.list({
  filter: { InStock: [true] },
  sort: ['-Price', 'Title'], // Prefix with '-' for descending sort
  limit: 50,
});

// --- Get single record by row ID ---
// Throws GristNotFoundError if not found
const product = await products.records.get(101);
console.log(product.id, product.Title, product.Price);

// --- Create single record ---
const created = await products.records.create({
  Title: 'Mechanical Keyboard',
  Price: 99.99,
  Stock: 15,
  InStock: true,
});
console.log(`Created ID: ${created.id}`);

// --- Update single record ---
await products.records.update(101, {
  Price: 89.99,
  Stock: 12,
});

// --- Delete record ---
await products.records.delete(101);
```

### Batch Operations (Create, Update, Delete)

Perform bulk operations in single round-trips:

```typescript
// 1. Batch Create
const createdItems = await products.records.create([
  { Title: 'Ergonomic Mouse', Price: 49.99, Stock: 30, InStock: true },
  { Title: 'USB-C Cable', Price: 12.99, Stock: 100, InStock: true },
  { Title: 'Desk Mat', Price: 19.99, Stock: 40, InStock: true },
]);
console.log('Created IDs:', createdItems.map(i => i.id));

// 2. Batch Update
await products.records.update([
  { id: createdItems[0].id, fields: { Price: 44.99 } },
  { id: createdItems[1].id, fields: { Stock: 95 } },
]);

// 3. Batch Delete
await products.records.delete([createdItems[0].id, createdItems[1].id]);

// Safe no-op on empty arrays (dispatches 0 HTTP requests)
await products.records.create([]);
await products.records.update([]);
await products.records.delete([]);
```

### Batch Upsert with Key Columns

Synchronize external data sources with Grist effortlessly. `upsert` matches existing rows by specified key columns and updates them, or inserts new rows if no match exists:

```typescript
await products.records.upsert(
  [
    { Title: 'Mechanical Keyboard', Price: 79.99, Stock: 25 },
    { Title: 'Gaming Headset', Price: 69.99, Stock: 50 },
  ],
  {
    keyCols: ['Title'], // Match existing rows where Title matches
    onMany: 'first',    // Behavior if multiple rows match: 'first' | 'none' | 'all'
  }
);
```

### Chainable Query Builder

Construct readable, chainable queries for complex filtering and pagination:

```typescript
const topAccessories = await products.records
  .query()
  .where({ Category: ['Accessories'], InStock: [true] })
  .sort('-Price', 'Title')
  .limit(10)
  .offset(0)
  .execute();

topAccessories.forEach((item) => {
  console.log(`${item.Title} - $${item.Price}`);
});
```

### Streaming Records with Async Iteration

Stream through large tables row by row with `for await...of`:

```typescript
// Stream every record in the table row by row
for await (const row of products.records.iterate()) {
  console.log(`Processing #${row.id}: ${row.Title}`);
}

// Or with filtering and sorting
for await (const row of products.records.iterate({ filter: { InStock: [true] }, sort: ['Title'] })) {
  console.log(`In-Stock Item: ${row.Title}`);
}
```

### Direct SQLite Queries (`doc.sql`)

Grist documents are SQLite databases underneath. Query your documents directly using SQL:

```typescript
interface DepartmentSummary {
  Department: string;
  TotalEmployees: number;
  AvgSalary: number;
  MaxSalary: number;
}

const summary = await doc.sql<DepartmentSummary>(`
  SELECT 
    Department, 
    COUNT(*) as TotalEmployees, 
    ROUND(AVG(Salary), 2) as AvgSalary,
    MAX(Salary) as MaxSalary
  FROM Employees
  GROUP BY Department
  ORDER BY TotalEmployees DESC
`);

for (const dept of summary) {
  console.log(`${dept.Department}: ${dept.TotalEmployees} staff, avg $${dept.AvgSalary}`);
}
```

### File Attachments (Upload & Download)

Upload and download files attached to Grist documents:

```typescript
import * as fs from 'node:fs/promises';

// 1. Upload a file
const pdfBytes = await fs.readFile('./contract.pdf');
const [attachmentId] = await doc.attachments.upload({
  filename: 'contract.pdf',
  data: pdfBytes,
  contentType: 'application/pdf',
});

// 2. Link attachment to a record column (Grist format: ['L', attachmentId])
await doc.table('Employees').records.create({
  Name: 'Jane Doe',
  Contracts: ['L', attachmentId],
});

// 3. Download attachment binary data
const fileBuffer = await doc.attachments.download(attachmentId);
await fs.writeFile('./downloaded_contract.pdf', Buffer.from(fileBuffer));

// 4. Retrieve attachment metadata
const meta = await doc.attachments.getMetadata(attachmentId);
console.log(meta.fileName, meta.fileSize, meta.timeUploaded);
```

### Schema & Webhook Management

Manage tables, columns, and outgoing webhooks programmatically:

```typescript
// List tables
const tables = await doc.tables.list();

// Create new table
await doc.tables.create([
  {
    id: 'Vendors',
    columns: [
      { id: 'VendorName', fields: { label: 'Vendor Name', type: 'Text' } },
      { id: 'ContactEmail', fields: { label: 'Contact Email', type: 'Text' } },
    ],
  },
]);

// Add column to existing table
await doc.table('Products').columns.create({
  id: 'SKU',
  fields: {
    label: 'Stock Keeping Unit',
    type: 'Text',
  },
});

// Register outgoing webhook
const webhook = await doc.webhooks.create({
  name: 'Sync to Inventory Service',
  url: 'https://api.mycompany.com/webhook',
  eventTypes: ['add', 'update'],
  tableId: 'Products',
  enabled: true,
});

// Deactivate or delete webhook
await doc.webhooks.update(webhook.id, { enabled: false });
await doc.webhooks.delete(webhook.id);
```

### Raw REST API Resources (`client.raw`)

For lower-level access or endpoints outside the fluent interface, the SDK exposes typed 1:1 REST resource clients under `client.raw`:

```typescript
// Organizations
const orgs = await grist.raw.orgs.list();
const org = await grist.raw.orgs.get(orgs[0].id);
const workspaces = await grist.raw.orgs.getWorkspaces(org.id);

// Workspaces & Documents
const workspace = await grist.raw.workspaces.get(3);
const newDocId = await grist.raw.docs.create(3, { name: 'Q4 Financials' });
await grist.raw.docs.rename(newDocId, '2026 Q4 Financials');
await grist.raw.docs.delete(newDocId);
```

Available low-level resources under `grist.raw`:
- `grist.raw.orgs`: Organizations and team sites
- `grist.raw.workspaces`: Workspaces and document listings
- `grist.raw.docs`: Document creation, metadata, pinning, and deletion
- `grist.raw.tables`: Table creation and inspection
- `grist.raw.columns`: Column creation and inspection
- `grist.raw.records`: Raw record CRUD and upserting
- `grist.raw.attachments`: Binary file upload, download, and metadata
- `grist.raw.webhooks`: Webhook creation, modification, and deletion
- `grist.raw.sql`: Direct SQLite queries

---

## CLI Type Generation (`grist-sdk typegen`)

Automatically introspect your live Grist document schema and generate strongly typed TypeScript declarations (`.d.ts`):

```bash
# Using pnpm
pnpm exec grist-sdk typegen --doc <DOC_ID_OR_URL> --out src/types/grist.d.ts

# Using npx
npx grist-sdk typegen -d <DOC_ID_OR_URL> -o src/types/grist.d.ts

# Using bun
bun x grist-sdk typegen -d <DOC_ID_OR_URL> -o src/types/grist.d.ts
```

### Adding Typegen to `package.json`

Add a convenient script to your `package.json`:

```json
{
  "scripts": {
    "typegen": "grist-sdk typegen --doc $GRIST_DOC_ID --out src/types/grist.d.ts"
  }
}
```

Now you can regenerate types anytime your Grist schema changes:

```bash
pnpm run typegen
```

### Using Generated Types

```typescript
import { GristClient } from 'grist-api-sdk';
import type { GristTables } from './types/grist';

const grist = new GristClient();
const doc = grist.doc('doc123');

// Products table has full autocomplete for all columns based on your live schema!
const products = doc.table<GristTables['Products']>('Products');

const item = await products.records.get(1);
console.log(item.Title, item.Price, item.InStock);
```

### Column Type Mapping Matrix

| Grist Column Type | Generated TypeScript Type | Description |
| :--- | :--- | :--- |
| `Text`, `String` | `string` | Text string |
| `Numeric`, `Int`, `Integer`, `ManualSortPos` | `number` | Float or integer |
| `Bool`, `Boolean` | `boolean` | True / false |
| `Date` | `string \| number` | ISO date string or timestamp |
| `DateTime` | `number` | Unix timestamp in seconds |
| `Choice` | `string` | Single choice string |
| `ChoiceList` | `string[]` | Array of choice strings |
| `Ref:<TableId>` | `number` | Row ID of referenced table |
| `RefList:<TableId>` | `number[]` | Array of row IDs |
| `Attachments`, `Attachment` | `number[]` | Array of attachment IDs |
| Unrecognized / custom | `unknown` | Fallback |

---

## Framework Integration Examples

### Next.js App Router (Server Component)

```typescript
// app/employees/page.tsx
import { GristClient } from 'grist-api-sdk';

// Initialize outside component or per-request
const grist = new GristClient({
  apiKey: process.env.GRIST_API_KEY,
  serverUrl: process.env.GRIST_SERVER,
});

export default async function EmployeesPage() {
  const employees = await grist
    .doc(process.env.GRIST_DOC_ID!)
    .table('Employees')
    .records.list({ sort: ['-Salary'] });

  return (
    <main>
      <h1>Employees Directory</h1>
      <ul>
        {employees.map((emp) => (
          <li key={emp.id}>
            {emp.Name} — {emp.Department} (${emp.Salary.toLocaleString()})
          </li>
        ))}
      </ul>
    </main>
  );
}
```

### Express / Fastify REST Endpoint

```typescript
import express from 'express';
import { GristClient } from 'grist-api-sdk';

const app = express();
app.use(express.json());

const grist = new GristClient();
const doc = grist.doc(process.env.GRIST_DOC_ID!);

// POST /api/inventory
app.post('/api/inventory', async (req, res, next) => {
  try {
    const { ItemName, Price, Category } = req.body;
    const item = await doc.table('Inventory').records.create({
      ItemName,
      Price,
      Category,
      InStock: true,
    });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});
```

---

## Custom HTTP Clients & Adapters (Ky, Axios, Proxies)

You can easily switch the underlying HTTP client to **Axios**, **Ky**, or custom proxy agents without writing boilerplate. The SDK includes built-in adapters (`createAxiosFetch`, `createKyFetch`) and **automatic client detection**.

### 1. Using Axios (1-Line Integration)

You can pass an `axios` instance directly into `fetch`—the SDK automatically detects Axios and adapts its requests, headers, and responses under the hood:

```typescript
import axios from 'axios';
import { GristClient } from 'grist-api-sdk';

// Option A: Direct pass (auto-detected!)
const grist = new GristClient({
  apiKey: process.env.GRIST_API_KEY,
  serverUrl: process.env.GRIST_SERVER,
  fetch: axios,
});

// Option B: Using the built-in createAxiosFetch helper (great for customized Axios instances)
import { createAxiosFetch } from 'grist-api-sdk';

const myAxios = axios.create({
  timeout: 15000,
  // Corporate proxy, custom certs, or interceptors:
  proxy: { host: 'proxy.internal', port: 8080 },
});

const gristWithProxy = new GristClient({
  apiKey: process.env.GRIST_API_KEY,
  fetch: createAxiosFetch(myAxios),
});

const employees = await grist.doc('doc123').table('Employees').records.list();
```

---

### 2. Using Ky (1-Line Integration)

Because [Ky](https://github.com/sindresorhus/ky) is built on standard Web Fetch, you can pass `ky` directly or use the `createKyFetch` helper:

```typescript
import ky from 'ky';
import { GristClient, createKyFetch } from 'grist-api-sdk';

// Option A: Direct pass
const grist = new GristClient({
  apiKey: process.env.GRIST_API_KEY,
  fetch: ky,
});

// Option B: With customized Ky hooks, retry, or timeout
const customKy = ky.extend({
  timeout: 10000,
  hooks: {
    beforeRequest: [
      (request) => console.log(`[Ky] ${request.method} ${request.url}`),
    ],
  },
});

const gristWithHooks = new GristClient({
  apiKey: process.env.GRIST_API_KEY,
  fetch: createKyFetch(customKy),
});
```

---

### Using Undici / Corporate Proxies

If you are operating behind a corporate HTTP proxy or need custom connection pool settings in Node.js, you can use [Undici](https://undici.nodejs.org/):

```typescript
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { GristClient } from 'grist-api-sdk';

// Configure proxy agent
const proxyAgent = new ProxyAgent('http://proxy.corporate.internal:8080');

const grist = new GristClient({
  apiKey: process.env.GRIST_API_KEY,
  serverUrl: 'https://docs.getgrist.com',
  fetch: (input, init) =>
    undiciFetch(input, {
      ...init,
      dispatcher: proxyAgent,
    } as any),
});
```

---

### Mocking for Unit Tests (Vitest / Jest)

Easily mock requests in automated test suites without dispatching actual network calls:

```typescript
import { vi } from 'vitest';
import { GristClient } from 'grist-api-sdk';

const mockFetch = vi.fn().mockResolvedValue(
  new Response(
    JSON.stringify({ records: [{ id: 1, fields: { Name: 'Mocked Item' } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
);

const grist = new GristClient({
  apiKey: 'test-key',
  fetch: mockFetch,
});

const items = await grist.doc('doc123').table('Items').records.list();
expect(items[0].Name).toBe('Mocked Item');
expect(mockFetch).toHaveBeenCalledTimes(1);
```

---

## Error Handling & Automatic Retries

### Error Hierarchy

All SDK errors inherit from `GristError`:

```
Error
 └── GristError
      ├── GristNetworkError        # Connection failures / DNS errors
      └── GristAPIError            # HTTP response errors
           ├── GristAuthError          # HTTP 401 Unauthorized
           ├── GristForbiddenError     # HTTP 403 Forbidden
           ├── GristNotFoundError     # HTTP 404 Not Found
           ├── GristValidationError    # HTTP 400 Bad Request / 422 Unprocessable
           └── GristRateLimitError     # HTTP 429 Too Many Requests (includes retryAfterSeconds)
```

### Granular Catching

```typescript
import {
  GristNotFoundError,
  GristRateLimitError,
  GristValidationError,
  GristAuthError,
  GristAPIError,
} from 'grist-api-sdk';

try {
  await products.records.get(9999);
} catch (error) {
  if (error instanceof GristNotFoundError) {
    console.error('Record not found:', error.message);
  } else if (error instanceof GristRateLimitError) {
    console.error(`Rate limited! Retry after ${error.retryAfterSeconds}s.`);
  } else if (error instanceof GristValidationError) {
    console.error('Validation error:', error.message, error.gristCode);
  } else if (error instanceof GristAuthError) {
    console.error('Invalid or missing API key.');
  } else if (error instanceof GristAPIError) {
    console.error(`HTTP ${error.statusCode}:`, error.message);
  }
}
```

### Customizing Automatic Retries

The client automatically retries transient errors (HTTP 429 and HTTP 5xx) using exponential backoff with decorrelated jitter, honoring server `Retry-After` headers.

```typescript
const grist = new GristClient({
  retry: {
    maxRetries: 5,     // Maximum retry attempts (default: 3)
    baseDelayMs: 500,  // Base delay before first retry in ms (default: 1000)
    maxDelayMs: 15000, // Maximum cap on backoff in ms (default: 30000)
  },
  // Or disable automatic retries:
  // retry: false,
});
```

---

## Security & Best Practices

- **Never Commit `.env`**: Always add `.env` and `.env*.local` to your `.gitignore`.
- **Server-Side Execution**: Run the SDK on your server, serverless functions, or edge workers. Do not expose your Grist API key in client-side Single Page Apps (React/Vue/Svelte in the browser).
- **Same-Origin Protection**: The SDK enforces strict same-origin restrictions to prevent leaking Bearer API tokens to external hosts.
- **Prototype Pollution Defense**: Flattened records and SQL results strip dangerous prototype keys (`__proto__`, `constructor`, `prototype`).
- **Filename Sanitization**: Uploaded attachment filenames are sanitized against path traversal sequences.

---

## API Reference Summary

| Client / Method | Return Type | Description |
| :--- | :--- | :--- |
| `new GristClient(config?)` | `GristClient` | Initializes root Grist client |
| `GristClient.fromDocUrl(url, config?)` | `DocClient` | Creates doc client directly from document URL |
| `client.doc(docId)` | `DocClient` | Scopes operations to a specific document |
| `doc.table<T>(tableId)` | `TableClient<T>` | Scopes operations to a specific table |
| `doc.sql<T>(query, params?)` | `Promise<T[]>` | Runs read-only SQLite query against document |
| `doc.attachments.upload(file)` | `Promise<number[]>` | Uploads one or more binary attachments |
| `doc.attachments.download(id)` | `Promise<ArrayBuffer>` | Downloads binary attachment content |
| `table.records.list(options?)` | `Promise<RecordWithId<T>[]>` | Lists table records (flattened by default) |
| `table.records.get(id)` | `Promise<RecordWithId<T>>` | Retrieves single record by numeric row ID |
| `table.records.create(data)` | `Promise<RecordWithId<T>>` | Creates one or multiple records |
| `table.records.update(id, fields)` | `Promise<void>` | Updates single record by row ID |
| `table.records.update(records)` | `Promise<void>` | Batch updates multiple records |
| `table.records.upsert(records, opts)` | `Promise<void>` | Batch upserts records matching key columns |
| `table.records.delete(id \| ids)` | `Promise<void>` | Deletes single or multiple record IDs |
| `table.records.iterate(options?)` | `AsyncIterableIterator<T>` | Streams records row by row |
| `table.records.query()` | `QueryBuilder<T>` | Chainable query builder |

---

## License

[MIT](LICENSE)
