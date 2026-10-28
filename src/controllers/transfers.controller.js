const transfersService = require('../services/transfers.service');

async function createTransfer(req, res, next) {
    try {
        const result = await transfersService.transfer(req.validated.body);
        res.status(result.duplicate ? 200 : 201).json(result);
    } catch (e) { next(e); }
}

module.exports = { createTransfer };