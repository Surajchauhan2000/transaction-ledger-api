const { withTransaction } = require('../config/db');
const AppError = require('../errors/AppError');
const accountsRepo = require('../repositories/accounts.repository');
const txnRepo = require('../repositories/transactions.repository');

async function addTransaction(accountId, { type, amount, description, reference_id }) {
    return withTransaction(async (client) => {
        // 1. Account lock karo (ye 404 bhi deta hai)
        const account = await accountsRepo.findByIdForUpdate(client, accountId);
        if (!account) {
            throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
        }

        // 2. Duplicate check (lock ki wajah se same account ke 2 parallel
        //    requests serialize ho jate hain, to race nahi hoti)
        const existing = await txnRepo.findByReference(client, accountId, reference_id);
        if (existing) {
            return { transaction: existing, duplicate: true };
        }

        // 3. Balance update (debit mein insufficient check SQL ke andar)
        let newBalance;
        if (type === 'credit') {
            newBalance = await accountsRepo.credit(client, accountId, amount);
        } else {
            newBalance = await accountsRepo.debit(client, accountId, amount);
            if (newBalance === null) {
                throw new AppError(422, 'INSUFFICIENT_BALANCE', 'Insufficient balance');
            }
        }

        // 4. Transaction record insert
        const transaction = await txnRepo.insert(client, {
            accountId, type, amount, description, referenceId: reference_id,
        });

        // Koi bhi step fail hua to throw -> ROLLBACK -> kuch persist nahi
        return { transaction, balance: newBalance, duplicate: false };
    });
}

module.exports = { addTransaction };