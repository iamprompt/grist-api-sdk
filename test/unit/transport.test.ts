import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpTransport } from '../../src/transport/HttpTransport';
import { RetryHandler } from '../../src/transport/RetryHandler';
import { resolveConfig } from '../../src/types/config';
import {
  GristAPIError,
  GristAuthError,
  GristNotFoundError,
  GristRateLimitError,
} from '../../src/errors';

describe('HttpTransport', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Configuration & URL Handling', () => {
    it('attaches Bearer token in Authorization header', async () => {
      let capturedHeaders: HeadersInit | undefined;
      const mockFetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const transport = new HttpTransport({ apiKey: 'secret-key', fetch: mockFetch });
      const res = await transport.request('/orgs');
      expect(res).toEqual({ success: true });
      expect((capturedHeaders as Record<string, string>)['Authorization']).toBe('Bearer secret-key');
    });

    it('merges custom headers with Authorization header', async () => {
      let capturedHeaders: HeadersInit | undefined;
      const mockFetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const transport = new HttpTransport({
        apiKey: 'secret-key',
        headers: { 'X-Custom-Client': 'unit-test' },
        fetch: mockFetch,
      });

      await transport.request('/test');
      const headers = capturedHeaders as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer secret-key');
      expect(headers['X-Custom-Client']).toBe('unit-test');
    });

    it('supports Ky-style custom fetch wrappers', async () => {
      // Ky returns a Promise<Response> conforming to standard Web Fetch
      const mockKyFetch = vi.fn().mockImplementation(async (_input: string, _init?: RequestInit) => {
        return new Response(JSON.stringify([{ id: 1, name: 'Alice' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const transport = new HttpTransport({
        apiKey: 'secret',
        fetch: (input, init) => mockKyFetch(input as string, init),
      });

      const res = await transport.request<Array<{ id: number; name: string }>>('/test');
      expect(res).toEqual([{ id: 1, name: 'Alice' }]);
      expect(mockKyFetch).toHaveBeenCalledTimes(1);
    });

    it('supports Axios-style adapters converted to Web Response', async () => {
      // Simulate an Axios-style client adapted to Web Fetch Response
      const mockAxios = vi.fn().mockResolvedValue({
        data: Buffer.from(JSON.stringify({ fromAxios: true })),
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });

      const axiosFetchAdapter: typeof fetch = async (input, init) => {
        const res = await mockAxios({
          url: input.toString(),
          method: init?.method ?? 'GET',
          headers: init?.headers,
          data: init?.body,
        });

        return new Response(res.data, {
          status: res.status,
          statusText: res.statusText,
          headers: new Headers(res.headers),
        });
      };

      const transport = new HttpTransport({
        apiKey: 'secret',
        fetch: axiosFetchAdapter,
      });

      const result = await transport.request<{ fromAxios: boolean }>('/test');
      expect(result).toEqual({ fromAxios: true });
      expect(mockAxios).toHaveBeenCalledTimes(1);
    });

    it('resolves default serverUrl to https://docs.getgrist.com', () => {
      delete process.env.GRIST_SERVER;
      delete process.env.GRIST_API_KEY;
      const transport = new HttpTransport();
      expect(transport.getBaseUrl()).toBe('https://docs.getgrist.com');
    });

    it('detects process.env.GRIST_API_KEY and process.env.GRIST_SERVER', () => {
      process.env.GRIST_API_KEY = 'env-api-key';
      process.env.GRIST_SERVER = 'https://custom-grist.example.com';
      const resolved = resolveConfig();
      expect(resolved.apiKey).toBe('env-api-key');
      expect(resolved.serverUrl).toBe('https://custom-grist.example.com');

      const transport = new HttpTransport();
      expect(transport.getBaseUrl()).toBe('https://custom-grist.example.com');
    });

    it('prefers explicit config over environment variables', () => {
      process.env.GRIST_API_KEY = 'env-api-key';
      process.env.GRIST_SERVER = 'https://env-server.example.com';
      const resolved = resolveConfig({
        apiKey: 'explicit-key',
        serverUrl: 'https://explicit-server.example.com',
      });
      expect(resolved.apiKey).toBe('explicit-key');
      expect(resolved.serverUrl).toBe('https://explicit-server.example.com');
    });

    it('strips redundant Bearer prefix in apiKey without duplicating', async () => {
      let capturedHeaders: HeadersInit | undefined;
      const mockFetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const transport = new HttpTransport({ apiKey: 'Bearer custom-token', fetch: mockFetch });
      await transport.request('/test');
      expect((capturedHeaders as Record<string, string>)['Authorization']).toBe('Bearer custom-token');
    });

    it('joins URLs correctly whether path starts with /api or not', async () => {
      let capturedUrls: string[] = [];
      const mockFetch = vi.fn().mockImplementation(async (url) => {
        capturedUrls.push(String(url));
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const transport = new HttpTransport({
        serverUrl: 'https://docs.getgrist.com/',
        fetch: mockFetch,
      });

      await transport.request('/orgs');
      await transport.request('docs/doc123');
      await transport.request('/api/workspaces/42');
      await transport.request('/apikeys');

      expect(capturedUrls[0]).toBe('https://docs.getgrist.com/api/orgs');
      expect(capturedUrls[1]).toBe('https://docs.getgrist.com/api/docs/doc123');
      expect(capturedUrls[2]).toBe('https://docs.getgrist.com/api/workspaces/42');
      expect(capturedUrls[3]).toBe('https://docs.getgrist.com/api/apikeys');
    });

    it('appends query parameters including primitives, arrays, and encoded values', async () => {
      let capturedUrl = '';
      const mockFetch = vi.fn().mockImplementation(async (url) => {
        capturedUrl = String(url);
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const transport = new HttpTransport({ fetch: mockFetch });
      await transport.request('/docs/doc1/tables/Table1/records', {
        params: {
          limit: 10,
          hidden: false,
          sort: 'name',
          filter: JSON.stringify({ Status: ['Active', 'Pending'] }),
          empty: undefined,
        },
      });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.get('hidden')).toBe('false');
      expect(url.searchParams.get('sort')).toBe('name');
      expect(url.searchParams.get('filter')).toBe(JSON.stringify({ Status: ['Active', 'Pending'] }));
      expect(url.searchParams.has('empty')).toBe(false);
    });
  });

  describe('Retry Engine & Error Normalization', () => {
    it('retries on 429 and succeeds on subsequent attempt', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Rate limit' }), {
            status: 429,
            headers: { 'Retry-After': '0', 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const transport = new HttpTransport({
        fetch: mockFetch,
        retry: { maxRetries: 2, baseDelayMs: 10 },
      });
      const res = await transport.request('/test');
      expect(res).toEqual({ ok: true });
      expect(callCount).toBe(2);
    });

    it('retries on 503 and succeeds on subsequent attempt', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Service Unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const transport = new HttpTransport({
        fetch: mockFetch,
        retry: { maxRetries: 2, baseDelayMs: 10 },
      });
      const res = await transport.request('/test');
      expect(res).toEqual({ ok: true });
      expect(callCount).toBe(2);
    });

    it('throws normalized GristAPIError when retries are exhausted on 500', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const transport = new HttpTransport({
        fetch: mockFetch,
        retry: { maxRetries: 2, baseDelayMs: 5 },
      });

      await expect(transport.request('/test')).rejects.toThrow(GristAPIError);
      expect(callCount).toBe(3); // 1 initial + 2 retries
    });

    it('does not retry 4xx errors (e.g. 401, 404)', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const transport = new HttpTransport({
        fetch: mockFetch,
        retry: { maxRetries: 3, baseDelayMs: 5 },
      });

      await expect(transport.request('/not-found')).rejects.toThrow(GristNotFoundError);
      expect(callCount).toBe(1);
    });

    it('handles 502 HTML error page without crashing JSON parser', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        })
      );
      const transport = new HttpTransport({ fetch: mockFetch, retry: false });
      await expect(transport.request('/test')).rejects.toThrow(GristAPIError);
    });

    it('respects retry: false to disable retries completely', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Rate limit' }), {
          status: 429,
          headers: { 'Retry-After': '0', 'Content-Type': 'application/json' },
        });
      });

      const transport = new HttpTransport({ fetch: mockFetch, retry: false });
      await expect(transport.request('/test')).rejects.toThrow(GristRateLimitError);
      expect(callCount).toBe(1);
    });

    it('handles 204 No Content by returning undefined', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 })
      );
      const transport = new HttpTransport({ fetch: mockFetch });
      const result = await transport.request('/test');
      expect(result).toBeUndefined();
    });

    it('does not retry aborted requests and rethrows immediately', async () => {
      let callCount = 0;
      const controller = new AbortController();
      controller.abort();

      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      });

      const transport = new HttpTransport({
        fetch: mockFetch,
        retry: { maxRetries: 3, baseDelayMs: 10 },
      });

      await expect(
        transport.request('/test', { signal: controller.signal })
      ).rejects.toThrow('The operation was aborted');

      expect(callCount).toBe(1);
    });

    it('supports requestRaw to obtain raw Response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('raw body content', { status: 200, headers: { 'Content-Type': 'text/plain' } })
      );
      const transport = new HttpTransport({ fetch: mockFetch });
      const rawRes = await transport.requestRaw('/raw');
      expect(rawRes).toBeInstanceOf(Response);
      expect(await rawRes.text()).toBe('raw body content');
    });
  });

  describe('RetryHandler Unit Tests', () => {
    it('honors parsed retryAfterSeconds from 429 error', () => {
      const handler = new RetryHandler({ baseDelayMs: 100, maxDelayMs: 5000 });
      const error = new GristRateLimitError('Rate limited', 429, undefined, 3);
      const delay = handler.calculateDelay(error, 0);
      expect(delay).toBe(3000);
    });

    it('bounds retryAfterSeconds to maxDelayMs', () => {
      const handler = new RetryHandler({ baseDelayMs: 100, maxDelayMs: 5000 });
      const error = new GristRateLimitError('Rate limited', 429, undefined, 60);
      const delay = handler.calculateDelay(error, 0);
      expect(delay).toBe(5000);
    });

    it('safely handles missing, invalid, or NaN retryAfter without producing NaN delay', () => {
      const handler = new RetryHandler({ baseDelayMs: 100, maxDelayMs: 5000 });
      const errWithUndef = new GristRateLimitError('Rate limited', 429, undefined, undefined);
      const delay1 = handler.calculateDelay(errWithUndef, 0);
      expect(Number.isFinite(delay1)).toBe(true);
      expect(delay1).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(delay1)).toBe(false);

      const errWithNaN = new GristRateLimitError('Rate limited', 429, undefined, NaN);
      const delay2 = handler.calculateDelay(errWithNaN, 0);
      expect(Number.isFinite(delay2)).toBe(true);
      expect(delay2).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(delay2)).toBe(false);

      const genericErr = new GristAPIError('Server Error', 500);
      const delay3 = handler.calculateDelay(genericErr, 1);
      expect(Number.isFinite(delay3)).toBe(true);
      expect(delay3).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(delay3)).toBe(false);
    });

    it('identifies retryable vs non-retryable errors correctly', () => {
      const handler = new RetryHandler({ maxRetries: 2 });
      expect(handler.shouldRetry(new GristRateLimitError('Rate limit', 429), 0)).toBe(true);
      expect(handler.shouldRetry(new GristAPIError('500 Error', 500), 0)).toBe(true);
      expect(handler.shouldRetry(new GristAPIError('502 Error', 502), 0)).toBe(true);
      expect(handler.shouldRetry(new GristAPIError('503 Error', 503), 0)).toBe(true);

      // Non-retryable
      expect(handler.shouldRetry(new GristAuthError('401', 401), 0)).toBe(false);
      expect(handler.shouldRetry(new GristNotFoundError('404', 404), 0)).toBe(false);

      // AbortError non-retryable
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      expect(handler.shouldRetry(abortError, 0)).toBe(false);

      // Max retries exceeded
      expect(handler.shouldRetry(new GristRateLimitError('Rate limit', 429), 2)).toBe(false);
    });
  });
});
