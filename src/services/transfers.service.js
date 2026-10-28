const { withTransaction } = require('../config/db');
const AppError = require('../errors/AppError');
const accountsRepo = require('../repositories/accounts.repository');
const txnRepo = require('../repositories/transactions.repository');

async function transfer({ from_account_id, to_account_id, amount, description, reference_id }) {
    return withTransaction(async (client) => {
        // 1. Dono accounts ek saath lock (ID order mein)
        const locked = await accountsRepo.lockManyOrdered(client, [from_account_id, to_account_id]);
        const found = new Set(locked.map((a) => a.id));
        if (!found.has(from_account_id)) {
            throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Source account not found');
        }
        if (!found.has(to_account_id)) {
            throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Destination account not found');
        }

        // 2. Idempotency: same reference_id se transfer pehle ho chuka?
        const outRef = `transfer:${reference_id}:out`;
        const inRef = `transfer:${reference_id}:in`;
        const existing = await txnRepo.findByReference(client, from_account_id, outRef);
        if (existing) {
            return { transfer: { reference_id, debit_transaction: existing }, duplicate: true };
        }

        // 3. Debit source (insufficient hone par null)
        const fromBalance = await accountsRepo.debit(client, from_account_id, amount);
        if (fromBalance === null) {
            throw new AppError(422, 'INSUFFICIENT_BALANCE', 'Insufficient balance in source account');
        }

        // 4. Credit destination
        const toBalance = await accountsRepo.credit(client, to_account_id, amount);

        // 5. Dono ledger entries
        const debitTxn = await txnRepo.insert(client, {
            accountId: from_account_id, type: 'debit', amount,
            description: description ?? `Transfer to ${to_account_id}`, referenceId: outRef,
        });
        const creditTxn = await txnRepo.insert(client, {
            accountId: to_account_id, type: 'credit', amount,
            description: description ?? `Transfer from ${from_account_id}`, referenceId: inRef,
        });

        // Koi bhi step fail -> ROLLBACK -> partial transfer impossible
        return {
            transfer: {
                reference_id,
                from_account_id,
                to_account_id,
                amount,
                from_balance: fromBalance,
                to_balance: toBalance,
                debit_transaction: debitTxn,
                credit_transaction: creditTxn,
            },
            duplicate: false,
        };
    });
}

module.exports = { transfer };