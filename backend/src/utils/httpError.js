// backend/src/utils/httpError.js
export class HttpError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {object | undefined} errors - optional structured errors (field-level)
   */
  constructor(statusCode, message, errors) {
    super(message);

    this.name = "HttpError";
    this.statusCode = statusCode;

    if (errors && typeof errors === "object" && !Array.isArray(errors)) {
      this.errors = errors;
    }

    Object.setPrototypeOf(this, new.target.prototype);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
  }
}