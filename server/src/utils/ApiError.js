// Custom error class so every layer can throw an error with an HTTP status.
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
  static badRequest(msg, details) { return new ApiError(400, msg, details); }
  static notFound(msg = 'Resource not found') { return new ApiError(404, msg); }
}

module.exports = ApiError;
