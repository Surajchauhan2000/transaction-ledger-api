const accountsService = require('../services/accounts.service');
const txnService = require('../services/transactions.service');

async function createAccount(req, res, next) {
    try {
        const account = await accountsService.createAccount(req.validated.body);
        res.status(201).json(account);
    } catch (e) { next(e); }
}

async function addTransaction(req, res, next) {
    try {
        const result = await txnService.addTransaction(
            req.validated.params.id,
            req.validated.body
        );
        res.status(result.duplicate ? 200 : 201).json(result);
    } catch (e) { next(e); }
}

module.exports = { createAccount, addTransaction };