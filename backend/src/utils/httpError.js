// src/utils/httpError.js
export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);

    this.name = "HttpError";
    this.statusCode = statusCode;

    // Ensure proper prototype chain (important for instanceof checks in some runtimes)
    Object.setPrototypeOf(this, new.target.prototype);

    // Optional: cleaner stack traces
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
  }
}