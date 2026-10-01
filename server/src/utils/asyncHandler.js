// Express 4 does not catch rejected promises from async handlers.
// This wrapper forwards any async error to next() → error-handling middleware.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
