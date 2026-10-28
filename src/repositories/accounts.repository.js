async function create(client, name) {
    const {rows} = await client.query(
        `INSERT INTO accounts (name)
         VALUES ($1) RETURNING id, name, balance, created_at`,
        [name]
    );
    return rows[0];
}

// Row lock: jab tak transaction chal rahi hai, is account pe koi aur
// transaction wait karegi. Race conditions yahin rukte hain.
async function findByIdForUpdate(client, id) {
    const {rows} = await client.query(
        `SELECT id, balance
         FROM accounts
         WHERE id = $1 FOR UPDATE`,
        [id]
    );
    return rows[0] || null;
}

async function credit(client, id, amount) {
    const {rows} = await client.query(
        `UPDATE accounts
         SET balance = balance + $1
         WHERE id = $2 RETURNING balance`,
        [amount, id]
    );
    return rows[0].balance;
}

// Balance check SQL ke andar hi: JS mein float comparison ka risk nahi
async function debit(client, id, amount) {
    const {rows} = await client.query(
        `UPDATE accounts
         SET balance = balance - $1
         WHERE id = $2
           AND balance >= $1 RETURNING balance`,
        [amount, id]
    );
    return rows[0] ? rows[0].balance : null; // null = insufficient
}

async function findById(client, id) {
    const {rows} = await client.query(
        `SELECT id, name, balance, created_at
         FROM accounts
         WHERE id = $1`,
        [id]
    );
    return rows[0] || null;
}

// Transfer ke liye: dono accounts ko ID ke order mein lock karo (deadlock se bachne ke liye)
async function lockManyOrdered(client, ids) {
    const {rows} = await client.query(
        `SELECT id, balance
         FROM accounts
         WHERE id = ANY ($1::uuid[])
         ORDER BY id FOR UPDATE`,
        [ids]
    );
    return rows;
}

module.exports = {create, findById, findByIdForUpdate, lockManyOrdered, credit, debit};