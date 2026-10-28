const accountsRepo = require('../repositories/accounts.repository');
const { pool, withTransaction } = require('../config/db');
const AppError = require('../errors/AppError');

// Client balance nahi bhej sakta: sirf name lete hain, balance DB default 0
async function createAccount({ name }) {
    return withTransaction((client) => accountsRepo.create(client, name.trim()));
}

async function getBalance(accountId) {
    const account = await accountsRepo.findById(pool, accountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    return { account_id: account.id, balance: account.balance };
}

module.exports = { createAccount, getBalance };