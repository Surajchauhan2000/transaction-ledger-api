const router = require('express').Router();
const c = require('../controllers/accounts.controller');
const validate = require('../middleware/validate');
const {
    createAccountSchema,
    addTransactionSchema,
    accountIdParamSchema,
} = require('../validators/schemas');

router.post('/', validate(createAccountSchema), c.createAccount);

router.post(
    '/:id/transactions',
    validate(accountIdParamSchema, 'params'),
    validate(addTransactionSchema),
    c.addTransaction
);

module.exports = router;