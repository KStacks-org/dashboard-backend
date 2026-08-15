export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class MustChangePasswordError extends AppError {
  constructor() {
    super(403, "MUST_CHANGE_PASSWORD", "You must change your temporary password before continuing");
  }
}

/**
 * The address is well-formed and on an allowed domain, but nobody on the roster
 * uses it. Deliberately distinct from a wrong password so the person is told to
 * ask for access rather than hunting for a typo in their password.
 */
export class EmailNotAllowedError extends AppError {
  constructor() {
    super(403, "EMAIL_NOT_ALLOWED", "This email is not authorised to use the dashboard");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(409, "CONFLICT", message, details);
  }
}
