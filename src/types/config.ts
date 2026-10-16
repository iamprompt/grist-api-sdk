import { GristValidationError } from '../errors';
import { AxiosInstanceLike, createAxiosFetch, isAxiosInstance } from '../transport/adapters';

export interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface GristClientConfig {
  apiKey?: string;
  serverUrl?: string;
  fetch?: typeof fetch | AxiosInstanceLike | unknown;
  headers?: Record<string, string>;
  retry?: RetryConfig | boolean;
}

export interface ResolvedRetryConfig {
  enabled: boolean;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface ResolvedGristClientConfig {
  apiKey?: string;
  serverUrl: string;
  fetch: typeof fetch;
  headers: Record<string, string>;
  retry: ResolvedRetryConfig;
}

export const DEFAULT_SERVER_URL = 'https://docs.getgrist.com';

export const DEFAULT_RETRY_CONFIG: ResolvedRetryConfig = {
  enabled: true,
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * Resolves user-provided configuration with environment variables and defaults.
 *
 * Precedence:
 * 1. Explicitly provided config object properties
 * 2. Environment variables: GRIST_API_KEY, GRIST_SERVER
 * 3. Default values (serverUrl: https://docs.getgrist.com)
 */
export function resolveConfig(config?: GristClientConfig): ResolvedGristClientConfig {
  const env = typeof process !== 'undefined' && process.env ? process.env : {};

  const rawApiKey = config?.apiKey ?? env.GRIST_API_KEY;
  let apiKey: string | undefined;
  if (rawApiKey) {
    if (/[\r\n]/.test(rawApiKey)) {
      throw new GristValidationError('Invalid API key: contains carriage return or newline characters');
    }
    const sanitized = rawApiKey.trim().replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
    apiKey = sanitized || undefined;
  }

  const rawServerUrl = config?.serverUrl ?? env.GRIST_SERVER ?? DEFAULT_SERVER_URL;
  if (typeof rawServerUrl !== 'string' || !rawServerUrl.trim()) {
    throw new GristValidationError('Invalid server URL: server URL must be a non-empty string');
  }

  let parsedServerUrl: URL;
  try {
    parsedServerUrl = new URL(rawServerUrl.trim());
  } catch {
    throw new GristValidationError(`Invalid server URL: "${rawServerUrl}" is not a valid URL`);
  }

  if (parsedServerUrl.protocol !== 'http:' && parsedServerUrl.protocol !== 'https:') {
    throw new GristValidationError(
      `Invalid server URL: protocol must be "http:" or "https:", got "${parsedServerUrl.protocol}"`
    );
  }

  // Normalize server URL: remove trailing slashes and redundant trailing /api
  const serverUrl = rawServerUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');

  // Validate headers against CRLF injection
  const headers: Record<string, string> = {};
  if (config?.headers) {
    for (const [k, v] of Object.entries(config.headers)) {
      if (/[\r\n]/.test(k) || (typeof v === 'string' && /[\r\n]/.test(v))) {
        throw new GristValidationError(`Invalid header: "${k}" contains carriage return or newline characters`);
      }
      headers[k] = String(v);
    }
  }

  let retry: ResolvedRetryConfig;
  if (config?.retry === false) {
    retry = {
      enabled: false,
      maxRetries: 0,
      baseDelayMs: DEFAULT_RETRY_CONFIG.baseDelayMs,
      maxDelayMs: DEFAULT_RETRY_CONFIG.maxDelayMs,
    };
  } else if (typeof config?.retry === 'object' && config.retry !== null) {
    retry = {
      enabled: true,
      maxRetries:
        typeof config.retry.maxRetries === 'number' && Number.isFinite(config.retry.maxRetries)
          ? config.retry.maxRetries
          : DEFAULT_RETRY_CONFIG.maxRetries,
      baseDelayMs:
        typeof config.retry.baseDelayMs === 'number' && Number.isFinite(config.retry.baseDelayMs)
          ? config.retry.baseDelayMs
          : DEFAULT_RETRY_CONFIG.baseDelayMs,
      maxDelayMs:
        typeof config.retry.maxDelayMs === 'number' && Number.isFinite(config.retry.maxDelayMs)
          ? config.retry.maxDelayMs
          : DEFAULT_RETRY_CONFIG.maxDelayMs,
    };
  } else {
    retry = { ...DEFAULT_RETRY_CONFIG };
  }

  let defaultFetch: typeof fetch;
  if (config?.fetch !== undefined) {
    if (isAxiosInstance(config.fetch)) {
      defaultFetch = createAxiosFetch(config.fetch);
    } else {
      defaultFetch = config.fetch as typeof fetch;
    }
  } else {
    defaultFetch =
      typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
        ? globalThis.fetch.bind(globalThis)
        : (undefined as unknown as typeof fetch);
  }

  return {
    apiKey,
    serverUrl,
    fetch: defaultFetch,
    headers,
    retry,
  };
}
