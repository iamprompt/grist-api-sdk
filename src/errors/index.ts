export class GristError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GristError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GristAPIError extends GristError {
  readonly statusCode: number;
  readonly gristCode?: string;
  readonly responseBody?: unknown;

  constructor(
    message: string,
    statusCode: number,
    responseBody?: unknown,
    gristCode?: string
  ) {
    super(message);
    this.name = 'GristAPIError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.gristCode = gristCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GristAuthError extends GristAPIError {
  constructor(
    message: string,
    statusCode: number = 401,
    responseBody?: unknown,
    gristCode?: string
  ) {
    super(message, statusCode, responseBody, gristCode);
    this.name = 'GristAuthError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GristForbiddenError extends GristAPIError {
  constructor(
    message: string,
    statusCode: number = 403,
    responseBody?: unknown,
    gristCode?: string
  ) {
    super(message, statusCode, responseBody, gristCode);
    this.name = 'GristForbiddenError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GristNotFoundError extends GristAPIError {
  constructor(
    message: string,
    statusCode: number = 404,
    responseBody?: unknown,
    gristCode?: string
  ) {
    super(message, statusCode, responseBody, gristCode);
    this.name = 'GristNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GristRateLimitError extends GristAPIError {
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    statusCode: number = 429,
    responseBody?: unknown,
    retryAfterSeconds?: number,
    gristCode?: string
  ) {
    super(message, statusCode, responseBody, gristCode);
    this.name = 'GristRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GristValidationError extends GristAPIError {
  constructor(
    message: string,
    statusCode: number = 400,
    responseBody?: unknown,
    gristCode?: string
  ) {
    super(message, statusCode, responseBody, gristCode);
    this.name = 'GristValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GristNetworkError extends GristError {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'GristNetworkError';
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { normalizeGristError } from '../transport/ErrorNormalizer';
