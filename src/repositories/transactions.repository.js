async function findByReference(client, accountId, referenceId) {
    const { rows } = await client.query(
        `SELECT * FROM transactions WHERE account_id = $1 AND reference_id = $2`,
        [accountId, referenceId]
    );
    return rows[0] || null;
}

async function insert(client, { accountId, type, amount, description, referenceId }) {
    const { rows } = await client.query(
        `INSERT INTO transactions (account_id, type, amount, description, reference_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [accountId, type, amount, description ?? null, referenceId]
    );
    return rows[0];
}

async function countByAccount(client, accountId, type) {
    const { rows } = await client.query(
        `SELECT COUNT(*)::int AS total FROM transactions
     WHERE account_id = $1 AND ($2::text IS NULL OR type = $2)`,
        [accountId, type ?? null]
    );
    return rows[0].total;
}

async function listByAccount(client, accountId, type, limit, offset) {
    const { rows } = await client.query(
        `SELECT * FROM transactions
     WHERE account_id = $1 AND ($2::text IS NULL OR type = $2)
     ORDER BY created_at DESC, id DESC
     LIMIT $3 OFFSET $4`,
        [accountId, type ?? null, limit, offset]
    );
    return rows;
}

module.exports = { findByReference, insert, countByAccount, listByAccount };