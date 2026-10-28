const AppError = require('../errors/AppError');

// source: 'body' | 'params' | 'query'
function validate(schema, source = 'body') {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);
        if (!result.success) {
            const details = result.error.issues.map((i) => ({
                field: i.path.join('.') || source,
                message: i.message,
            }));
            return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request data', details));
        }
        // Express 5 mein req.query read-only hota hai, isliye alag key mein rakhte hain
        req.validated = req.validated || {};
        req.validated[source] = result.data;
        next();
    };
}

module.exports = validate;