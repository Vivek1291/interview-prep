// Generic validation middleware: validate req.body / req.query / req.params with a zod schema.
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(result.error);
  if (source === 'body') req.body = result.data; // use the parsed/cleaned data
  else req.validated = result.data;
  next();
};

module.exports = validate;
