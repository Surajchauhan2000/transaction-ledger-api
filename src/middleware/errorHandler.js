function notFoundHandler(req, res) {
    res.status(404).json({
        error: { code: 'ROUTE_NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` },
    });
}

function errorHandler(err, req, res, next) {
    // Hamare apne errors
    if (err.statusCode && err.code) {
        return res.status(err.statusCode).json({
            error: { code: err.code, message: err.message, details: err.details },
        });
    }

    // Galat JSON body (body-parser)
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
        });
    }

    // Postgres safety nets (validation chook jaye tab bhi 500 na aaye)
    if (err.code === '23505') { // unique violation
        return res.status(409).json({
            error: { code: 'DUPLICATE_RESOURCE', message: 'Resource already exists' },
        });
    }
    if (err.code === '22P02') { // invalid text representation (jaise bad UUID)
        return res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'Invalid input format' },
        });
    }

    console.error(err);
    res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
}

module.exports = { errorHandler, notFoundHandler };