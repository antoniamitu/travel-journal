// backend/src/utils/httpError.js
export class HttpError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {object | undefined} errors - optional structured field-level errors
   * @param {object | undefined} payload - optional extra response payload, e.g. code/details
   */
  constructor(statusCode, message, errors, payload) {
    super(message);

    this.name = "HttpError";
    this.statusCode = statusCode;

    if (errors && typeof errors === "object" && !Array.isArray(errors)) {
      this.errors = errors;
    }

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      this.payload = payload;
    }

    Object.setPrototypeOf(this, new.target.prototype);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
  }
}