/**
 * Lightweight structural interfaces for Axios and Ky to maintain zero runtime dependencies.
 */
export interface AxiosResponseLike<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, unknown> | Headers;
}

export interface AxiosInstanceLike {
  (config: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    data?: unknown;
    signal?: AbortSignal;
    validateStatus?: (status: number) => boolean;
    responseType?: string;
    [key: string]: unknown;
  }): Promise<AxiosResponseLike>;
  defaults?: unknown;
  interceptors?: unknown;
}

export interface KyInstanceLike {
  (input: string | URL | Request, options?: RequestInit): Promise<Response>;
}

/**
 * Checks whether an object is an Axios client instance.
 */
export function isAxiosInstance(client: unknown): client is AxiosInstanceLike {
  return (
    typeof client === 'function' &&
    client !== null &&
    'defaults' in client &&
    'interceptors' in client
  );
}

/**
 * Adapts an Axios instance into a standard Web Fetch function compatible with GristClient.
 *
 * Enables seamless integration of Axios features like corporate proxies, custom interceptors,
 * and SSL configurations with GristClient.
 *
 * @param axiosInstance - An Axios instance or the default `axios` import.
 * @returns A standard `fetch` function that routes requests through Axios.
 *
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { GristClient, createAxiosFetch } from 'grist-api-sdk';
 *
 * const grist = new GristClient({
 *   fetch: createAxiosFetch(axios),
 * });
 * ```
 */
export function createAxiosFetch(axiosInstance: AxiosInstanceLike | unknown): typeof fetch {
  const axios = axiosInstance as AxiosInstanceLike;

  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
        init.headers.forEach((v, k) => {
          headers[k] = v;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) {
          if (k) headers[k] = v;
        }
      } else if (typeof init.headers === 'object') {
        for (const [k, v] of Object.entries(init.headers)) {
          if (v !== undefined) headers[k] = String(v);
        }
      }
    }

    const res = await axios({
      url,
      method: init?.method ?? 'GET',
      headers,
      data: init?.body,
      signal: init?.signal ? (init.signal as AbortSignal) : undefined,
      validateStatus: () => true, // Ensure Axios doesn't throw so GristClient can normalize HTTP errors
      responseType: 'arraybuffer', // Handle both JSON strings and binary attachment data
    });

    const responseHeaders = new Headers();
    if (res.headers) {
      if (typeof Headers !== 'undefined' && res.headers instanceof Headers) {
        res.headers.forEach((v, k) => responseHeaders.set(k, v));
      } else if (typeof res.headers === 'object') {
        for (const [k, v] of Object.entries(res.headers)) {
          if (v !== undefined && v !== null) {
            responseHeaders.set(k, Array.isArray(v) ? v.join(', ') : String(v));
          }
        }
      }
    }

    return new Response(res.data as BodyInit, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  }) as typeof fetch;
}

/**
 * Adapts a Ky instance into a standard Web Fetch function compatible with GristClient.
 *
 * @param kyInstance - A Ky instance or the default `ky` import.
 * @returns A standard `fetch` function that routes requests through Ky.
 *
 * @example
 * ```typescript
 * import ky from 'ky';
 * import { GristClient, createKyFetch } from 'grist-api-sdk';
 *
 * const grist = new GristClient({
 *   fetch: createKyFetch(ky),
 * });
 * ```
 */
export function createKyFetch(kyInstance: KyInstanceLike | unknown): typeof fetch {
  const ky = kyInstance as KyInstanceLike;
  return ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    return ky(input, init);
  }) as typeof fetch;
}
