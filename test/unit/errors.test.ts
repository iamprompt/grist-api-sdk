import { describe, it, expect } from 'vitest';
import {
  GristError,
  GristAPIError,
  GristAuthError,
  GristForbiddenError,
  GristNotFoundError,
  GristRateLimitError,
  GristValidationError,
  GristNetworkError,
  normalizeGristError,
} from '../../src/errors';

describe('Error Normalizer', () => {
  it('normalizes 401 to GristAuthError', () => {
    const err = normalizeGristError(401, { error: 'Invalid API key' });
    expect(err).toBeInstanceOf(GristAuthError);
    expect(err).toBeInstanceOf(GristAPIError);
    expect(err).toBeInstanceOf(GristError);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Invalid API key');
    expect(err.name).toBe('GristAuthError');
  });

  it('normalizes 403 to GristForbiddenError', () => {
    const err = normalizeGristError(403, { error: 'Access forbidden', code: 'FORBIDDEN' });
    expect(err).toBeInstanceOf(GristForbiddenError);
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Access forbidden');
    expect(err.gristCode).toBe('FORBIDDEN');
    expect(err.name).toBe('GristForbiddenError');
  });

  it('normalizes 404 to GristNotFoundError', () => {
    const err = normalizeGristError(404, { error: 'Table not found' });
    expect(err).toBeInstanceOf(GristNotFoundError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Table not found');
    expect(err.name).toBe('GristNotFoundError');
  });

  it('normalizes 400 and 422 to GristValidationError', () => {
    const err400 = normalizeGristError(400, { error: 'Invalid column schema' });
    expect(err400).toBeInstanceOf(GristValidationError);
    expect(err400.statusCode).toBe(400);
    expect(err400.message).toBe('Invalid column schema');

    const err422 = normalizeGristError(422, { message: 'Unprocessable entity' });
    expect(err422).toBeInstanceOf(GristValidationError);
    expect(err422.statusCode).toBe(422);
    expect(err422.message).toBe('Unprocessable entity');
  });

  it('normalizes 429 to GristRateLimitError with parsed Retry-After', () => {
    const err = normalizeGristError(429, { error: 'Too Many Requests' }, '15');
    expect(err).toBeInstanceOf(GristRateLimitError);
    expect(err.statusCode).toBe(429);
    expect(err.retryAfterSeconds).toBe(15);
    expect(err.name).toBe('GristRateLimitError');
  });

  it('parses HTTP-date Retry-After headers', () => {
    const targetDate = new Date(Date.now() + 60_000);
    const err = normalizeGristError(429, 'Rate limit hit', targetDate.toUTCString());
    expect(err).toBeInstanceOf(GristRateLimitError);
    expect(err.retryAfterSeconds).toBeDefined();
    expect(err.retryAfterSeconds).toBeGreaterThanOrEqual(58);
    expect(err.retryAfterSeconds).toBeLessThanOrEqual(61);
  });

  it('handles non-numeric or missing Retry-After without NaN', () => {
    const err = normalizeGristError(429, 'Rate limit hit', 'invalid-header');
    expect(err).toBeInstanceOf(GristRateLimitError);
    expect(err.retryAfterSeconds).toBeUndefined();
    expect(err.message).toBe('Rate limit hit');

    const errNoHeader = normalizeGristError(429, 'Rate limit hit');
    expect(errNoHeader.retryAfterSeconds).toBeUndefined();
  });

  it('normalizes 500 and unexpected statuses to generic GristAPIError', () => {
    const err500 = normalizeGristError(500, { error: 'Internal server error' });
    expect(err500).toBeInstanceOf(GristAPIError);
    expect(err500.constructor).toBe(GristAPIError);
    expect(err500.statusCode).toBe(500);

    const err502 = normalizeGristError(502, '<html><head><title>502 Bad Gateway</title></head><body>502 Bad Gateway</body></html>');
    expect(err502).toBeInstanceOf(GristAPIError);
    expect(err502.statusCode).toBe(502);
    expect(err502.message).toBe('502 Bad Gateway');
  });

  it('extracts messages from various body shapes', () => {
    // Nested error object
    const nested = normalizeGristError(400, { error: { message: 'Nested error message' } });
    expect(nested.message).toBe('Nested error message');

    // JSON string body
    const jsonStr = normalizeGristError(401, JSON.stringify({ error: 'Auth failed from string', code: 'NO_AUTH' }));
    expect(jsonStr.message).toBe('Auth failed from string');
    expect(jsonStr.gristCode).toBe('NO_AUTH');

    // Null or undefined body
    const nullBody = normalizeGristError(503, null);
    expect(nullBody.message).toBe('HTTP 503');

    // Empty string body
    const emptyBody = normalizeGristError(504, '');
    expect(emptyBody.message).toBe('HTTP 504');
  });
});

describe('Error Hierarchy Direct Instantiation', () => {
  it('instantiates GristNetworkError with cause', () => {
    const originalError = new TypeError('Failed to fetch');
    const netErr = new GristNetworkError('Network connectivity failure', originalError);
    expect(netErr).toBeInstanceOf(GristNetworkError);
    expect(netErr).toBeInstanceOf(GristError);
    expect(netErr).toBeInstanceOf(Error);
    expect(netErr.name).toBe('GristNetworkError');
    expect(netErr.message).toBe('Network connectivity failure');
    expect(netErr.cause).toBe(originalError);
  });

  it('instantiates GristRateLimitError with default status code', () => {
    const rateErr = new GristRateLimitError('Too many calls', 429, undefined, 30);
    expect(rateErr.statusCode).toBe(429);
    expect(rateErr.retryAfterSeconds).toBe(30);
  });

  it('instantiates subclasses with sensible default status codes', () => {
    const authErr = new GristAuthError('Not authenticated');
    expect(authErr.statusCode).toBe(401);

    const forbErr = new GristForbiddenError('Forbidden');
    expect(forbErr.statusCode).toBe(403);

    const notFoundErr = new GristNotFoundError('Missing');
    expect(notFoundErr.statusCode).toBe(404);

    const valErr = new GristValidationError('Invalid');
    expect(valErr.statusCode).toBe(400);
  });
});
