import {
  GristAPIError,
  GristAuthError,
  GristForbiddenError,
  GristNotFoundError,
  GristRateLimitError,
  GristValidationError,
} from '../errors';

/**
 * Parses HTTP Retry-After header value into number of seconds.
 * Returns undefined if header is absent, empty, or unparseable.
 */
function parseRetryAfter(header?: string | null): number | undefined {
  if (!header || typeof header !== 'string') {
    return undefined;
  }
  const trimmed = header.trim();
  if (!trimmed) {
    return undefined;
  }
  // Delay in seconds (integer string)
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
  }
  // HTTP-date format (RFC 7231 / RFC 9110)
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diffSeconds = Math.ceil((dateMs - Date.now()) / 1000);
    return diffSeconds >= 0 ? diffSeconds : 0;
  }
  return undefined;
}

/**
 * Extracts a concise human-readable message from an HTML error document.
 */
function extractHtmlMessage(html: string): string | undefined {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]?.trim()) {
    return titleMatch[1].trim();
  }
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match && h1Match[1]?.trim()) {
    return h1Match[1].trim();
  }
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (stripped) {
    return stripped.length > 300 ? `${stripped.slice(0, 300)}...` : stripped;
  }
  return undefined;
}

/**
 * Extracts error message and optional Grist error code from response body.
 */
function extractErrorDetails(body: unknown, statusCode: number): { message: string; gristCode?: string } {
  if (body === null || body === undefined) {
    return { message: `HTTP ${statusCode}` };
  }

  // If body is already a string
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed) {
      return { message: `HTTP ${statusCode}` };
    }

    // Try parsing as JSON if it looks like an object or array
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractErrorDetails(parsed, statusCode);
      } catch {
        // Not valid JSON, continue
      }
    }

    // Check if it's HTML
    if (/<[a-z][\s\S]*>/i.test(trimmed)) {
      const htmlMsg = extractHtmlMessage(trimmed);
      return { message: htmlMsg || `HTTP ${statusCode}` };
    }

    return { message: trimmed };
  }

  // If body is an object
  if (typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    const gristCode =
      typeof obj.code === 'string'
        ? obj.code
        : typeof obj.gristCode === 'string'
          ? obj.gristCode
          : typeof obj.errorCode === 'string'
            ? obj.errorCode
            : undefined;

    let message: string | undefined;

    if (typeof obj.error === 'string' && obj.error.trim()) {
      message = obj.error.trim();
    } else if (typeof obj.error === 'object' && obj.error !== null) {
      const nested = obj.error as Record<string, unknown>;
      if (typeof nested.message === 'string' && nested.message.trim()) {
        message = nested.message.trim();
      } else if (typeof nested.error === 'string' && nested.error.trim()) {
        message = nested.error.trim();
      }
    } else if (typeof obj.message === 'string' && obj.message.trim()) {
      message = obj.message.trim();
    } else if (typeof obj.details === 'string' && obj.details.trim()) {
      message = obj.details.trim();
    } else if (typeof obj.description === 'string' && obj.description.trim()) {
      message = obj.description.trim();
    }

    return {
      message: message || `HTTP ${statusCode}`,
      gristCode,
    };
  }

  return { message: String(body) || `HTTP ${statusCode}` };
}

/**
 * Normalizes HTTP status code and response body into a structured GristAPIError subclass.
 */
export function normalizeGristError(statusCode: 400 | 422, body: unknown, retryAfterHeader?: string | null): GristValidationError;
export function normalizeGristError(statusCode: 401, body: unknown, retryAfterHeader?: string | null): GristAuthError;
export function normalizeGristError(statusCode: 403, body: unknown, retryAfterHeader?: string | null): GristForbiddenError;
export function normalizeGristError(statusCode: 404, body: unknown, retryAfterHeader?: string | null): GristNotFoundError;
export function normalizeGristError(statusCode: 429, body: unknown, retryAfterHeader?: string | null): GristRateLimitError;
export function normalizeGristError(statusCode: number, body: unknown, retryAfterHeader?: string | null): GristAPIError;
export function normalizeGristError(
  statusCode: number,
  body: unknown,
  retryAfterHeader?: string | null
): GristAPIError {
  const { message, gristCode } = extractErrorDetails(body, statusCode);

  switch (statusCode) {
    case 400:
    case 422:
      return new GristValidationError(message, statusCode, body, gristCode);
    case 401:
      return new GristAuthError(message, statusCode, body, gristCode);
    case 403:
      return new GristForbiddenError(message, statusCode, body, gristCode);
    case 404:
      return new GristNotFoundError(message, statusCode, body, gristCode);
    case 429: {
      const retryAfterSeconds = parseRetryAfter(retryAfterHeader);
      return new GristRateLimitError(message, statusCode, body, retryAfterSeconds, gristCode);
    }
    default:
      return new GristAPIError(message, statusCode, body, gristCode);
  }
}
