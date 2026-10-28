const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

const api = () => request(app);

// TRUNCATE row triggers fire nahi karta, isliye immutability trigger se problem nahi aati
async function resetDb() {
    await pool.query('TRUNCATE transactions, accounts');
}

async function createAccount(name = 'Test User') {
    const res = await api().post('/accounts').send({ name });
    return res.body;
}

function addTxn(accountId, body) {
    return api().post(`/accounts/${accountId}/transactions`).send(body);
}

async function getBalance(accountId) {
    const res = await api().get(`/accounts/${accountId}/balance`);
    return res.body.balance;
}

module.exports = { api, pool, resetDb, createAccount, addTxn, getBalance };