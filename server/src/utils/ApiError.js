// Custom error class so every layer can throw an error with an HTTP status.
class ApiError extends Error {
  constructor(statusCode, message, details, code) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
  }
  static badRequest(msg, details) { return new ApiError(400, msg, details); }
  static unauthorized(msg = 'Please log in', code = 'UNAUTHENTICATED') { return new ApiError(401, msg, undefined, code); }
  static forbidden(msg = 'You are not allowed to do this') { return new ApiError(403, msg, undefined, 'FORBIDDEN'); }
  static notFound(msg = 'Resource not found') { return new ApiError(404, msg); }
  static conflict(msg) { return new ApiError(409, msg, undefined, 'CONFLICT'); }
}

module.exports = ApiError;
