const router = require('express').Router();
const c = require('../controllers/accounts.controller');
const validate = require('../middleware/validate');
const {
    createAccountSchema,
    addTransactionSchema,
    accountIdParamSchema,
    historyQuerySchema
} = require('../validators/schemas');

router.post('/', validate(createAccountSchema), c.createAccount);

router.post(
    '/:id/transactions',
    validate(accountIdParamSchema, 'params'),
    validate(addTransactionSchema),
    c.addTransaction
);

router.get('/:id/balance', validate(accountIdParamSchema, 'params'), c.getBalance);

router.get(
    '/:id/transactions',
    validate(accountIdParamSchema, 'params'),
    validate(historyQuerySchema, 'query'),
    c.getHistory
);
module.exports = router;