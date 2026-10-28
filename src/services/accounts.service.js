const { withTransaction } = require('../config/db');
const accountsRepo = require('../repositories/accounts.repository');

// Client balance nahi bhej sakta: sirf name lete hain, balance DB default 0
async function createAccount({ name }) {
    return withTransaction((client) => accountsRepo.create(client, name.trim()));
}

module.exports = { createAccount };