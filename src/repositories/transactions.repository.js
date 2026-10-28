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

module.exports = { findByReference, insert };