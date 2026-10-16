import { GristError, GristNetworkError, normalizeGristError } from '../errors';
import { GristClientConfig, ResolvedGristClientConfig, resolveConfig } from '../types/config';
import { RetryHandler } from './RetryHandler';

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

function deleteHeader(headers: Record<string, string>, name: string): void {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      delete headers[k];
    }
  }
}

export class HttpTransport {
  private readonly config: ResolvedGristClientConfig;
  private readonly retryHandler: RetryHandler;

  constructor(config?: GristClientConfig) {
    this.config = resolveConfig(config);
    this.retryHandler = new RetryHandler(config?.retry ?? this.config.retry);
  }

  /**
   * Returns the base server URL for this transport (e.g. 'https://docs.getgrist.com').
   */
  getBaseUrl(): string {
    return this.config.serverUrl;
  }

  /**
   * Constructs the full URL, prepending /api if not present and appending query parameters.
   */
  private buildUrl(path: string, params?: Record<string, unknown>): URL {
    let url: URL;
    if (/^https?:\/\//i.test(path)) {
      url = new URL(path);
    } else {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const isApiPath = cleanPath === '/api' || cleanPath.startsWith('/api/');
      const apiPath = isApiPath ? cleanPath : `/api${cleanPath}`;
      url = new URL(`${this.config.serverUrl}${apiPath}`);
    }

    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item !== undefined && item !== null) {
              url.searchParams.append(key, String(item));
            }
          }
        } else if (typeof value === 'object') {
          url.searchParams.set(key, JSON.stringify(value));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url;
  }

  /**
   * Merges config headers, auth token, and request-specific headers into a plain Record.
   */
  private buildHeaders(initHeaders?: HeadersInit, body?: BodyInit | null): Record<string, string> {
    const headers: Record<string, string> = {};

    // 1. Config headers
    for (const [k, v] of Object.entries(this.config.headers)) {
      if (v !== undefined) {
        headers[k] = String(v);
      }
    }

    // 2. Request headers
    if (initHeaders) {
      if (typeof Headers !== 'undefined' && initHeaders instanceof Headers) {
        initHeaders.forEach((v, k) => {
          headers[k] = v;
        });
      } else if (Array.isArray(initHeaders)) {
        for (const [k, v] of initHeaders) {
          if (k) headers[k] = v;
        }
      } else if (typeof initHeaders === 'object') {
        for (const [k, v] of Object.entries(initHeaders)) {
          if (v !== undefined) {
            headers[k] = String(v);
          }
        }
      }
    }

    // 3. Authorization Bearer token (if not already set)
    if (this.config.apiKey && !hasHeader(headers, 'Authorization')) {
      const cleanKey = this.config.apiKey
        .trim()
        .replace(/^Bearer\s+/i, '')
        .replace(/^["']|["']$/g, '')
        .trim();
      headers['Authorization'] = `Bearer ${cleanKey}`;
    }

    // 4. Content-Type header
    if (body) {
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        // Let fetch automatically set multipart/form-data boundary
        deleteHeader(headers, 'Content-Type');
      } else if (typeof body === 'string' && !hasHeader(headers, 'Content-Type')) {
        headers['Content-Type'] = 'application/json';
      }
    }

    return headers;
  }

  /**
   * Executes an HTTP request and returns the raw Response.
   * Handles retry logic for 429 and 5xx errors, and normalizes failures.
   */
  async requestRaw(
    path: string,
    options?: RequestInit & { params?: Record<string, unknown> }
  ): Promise<Response> {
    const { params, headers: initHeaders, ...initOptions } = options ?? {};
    const url = this.buildUrl(path, params);
    const headers = this.buildHeaders(initHeaders, initOptions.body);

    const fetchFn = this.config.fetch;
    if (typeof fetchFn !== 'function') {
      throw new GristNetworkError('Global fetch is not available and no custom fetch was provided.');
    }

    return await this.retryHandler.execute(async () => {
      let response: Response;
      try {
        response = await fetchFn(url.toString(), {
          ...initOptions,
          headers,
        });
      } catch (err) {
        if (err instanceof GristError) {
          throw err;
        }
        // Do not wrap or retry explicitly aborted requests
        const isAbort =
          (err as Error)?.name === 'AbortError' ||
          Boolean(initOptions.signal?.aborted);
        if (isAbort) {
          throw err;
        }
        throw new GristNetworkError(
          `Network request failed: ${err instanceof Error ? err.message : String(err)}`,
          err
        );
      }

      if (!response.ok) {
        // Handle non-JSON responses (like 502 HTML) gracefully without crashing
        const rawText = await response.text().catch(() => '');
        let parsedBody: unknown = rawText;
        if (rawText) {
          try {
            parsedBody = JSON.parse(rawText);
          } catch {
            parsedBody = rawText;
          }
        }
        const retryAfter = response.headers.get('Retry-After');
        throw normalizeGristError(response.status, parsedBody, retryAfter);
      }

      return response;
    });
  }

  /**
   * Executes an HTTP request and parses the JSON response body.
   * Returns undefined for 204 No Content responses.
   */
  async request<T = unknown>(
    path: string,
    options?: RequestInit & { params?: Record<string, unknown> }
  ): Promise<T> {
    const response = await this.requestRaw(path, options);

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text().catch(() => '');
    if (!text.trim()) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
}
