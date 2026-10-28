const { api, pool, resetDb, createAccount, addTxn, getBalance } = require('./helpers');

const MISSING_ID = '00000000-0000-0000-0000-000000000000';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('Create account', () => {
    test('creates account with balance 0', async () => {
        const res = await api().post('/accounts').send({ name: 'Suraj' });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ name: 'Suraj', balance: '0.00' });
        expect(res.body.id).toBeDefined();
        expect(res.body.created_at).toBeDefined();
    });

    test('rejects missing name', async () => {
        const res = await api().post('/accounts').send({});
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details[0].field).toBe('name');
    });

    test('rejects client-supplied balance', async () => {
        const res = await api().post('/accounts').send({ name: 'Hacker', balance: 500 });
        expect(res.status).toBe(400);
    });

    test('rejects invalid JSON', async () => {
        const res = await api()
            .post('/accounts')
            .set('Content-Type', 'application/json')
            .send('{"name": }');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_JSON');
    });
});

describe('Add transaction', () => {
    test('credit increases, debit decreases balance', async () => {
        const acc = await createAccount();
        const c = await addTxn(acc.id, { type: 'credit', amount: 100, reference_id: 'r1' });
        expect(c.status).toBe(201);
        expect(c.body.balance).toBe('100.00');

        const d = await addTxn(acc.id, { type: 'debit', amount: 30, reference_id: 'r2' });
        expect(d.status).toBe(201);
        expect(d.body.balance).toBe('70.00');
    });

    test('rejects debit with insufficient balance and balance stays same', async () => {
        const acc = await createAccount();
        await addTxn(acc.id, { type: 'credit', amount: 100, reference_id: 'r1' });

        const res = await addTxn(acc.id, { type: 'debit', amount: 150, reference_id: 'r2' });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
        expect(await getBalance(acc.id)).toBe('100.00');
    });

    test('duplicate reference_id: no new txn, balance unchanged', async () => {
        const acc = await createAccount();
        const body = { type: 'credit', amount: 100, reference_id: 'dup-1' };
        const first = await addTxn(acc.id, body);
        const second = await addTxn(acc.id, body);

        expect(first.status).toBe(201);
        expect(second.status).toBe(200);
        expect(second.body.duplicate).toBe(true);
        expect(second.body.transaction.id).toBe(first.body.transaction.id);
        expect(await getBalance(acc.id)).toBe('100.00');

        const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM transactions');
        expect(rows[0].n).toBe(1);
    });

    test('same reference_id is allowed on a different account', async () => {
        const a = await createAccount('A');
        const b = await createAccount('B');
        const body = { type: 'credit', amount: 10, reference_id: 'shared' };
        expect((await addTxn(a.id, body)).status).toBe(201);
        expect((await addTxn(b.id, body)).status).toBe(201);
    });

    test('final balance matches sum of valid transactions', async () => {
        const acc = await createAccount();
        await addTxn(acc.id, { type: 'credit', amount: 100, reference_id: '1' });
        await addTxn(acc.id, { type: 'credit', amount: 50, reference_id: '2' });
        await addTxn(acc.id, { type: 'debit', amount: 30, reference_id: '3' });
        await addTxn(acc.id, { type: 'debit', amount: 20, reference_id: '4' });
        expect(await getBalance(acc.id)).toBe('100.00');
    });

    test('accepts string amount with 2 decimals', async () => {
        const acc = await createAccount();
        const res = await addTxn(acc.id, { type: 'credit', amount: '25.50', reference_id: 's1' });
        expect(res.status).toBe(201);
        expect(res.body.balance).toBe('25.50');
    });

    test.each([
        ['invalid type', { type: 'abc', amount: 10, reference_id: 'x' }],
        ['negative amount', { type: 'credit', amount: -5, reference_id: 'x' }],
        ['zero amount', { type: 'credit', amount: 0, reference_id: 'x' }],
        ['3 decimals', { type: 'credit', amount: 10.555, reference_id: 'x' }],
        ['non-numeric amount', { type: 'credit', amount: 'abc', reference_id: 'x' }],
        ['missing amount', { type: 'credit', reference_id: 'x' }],
        ['missing reference_id', { type: 'credit', amount: 10 }],
        ['blank reference_id', { type: 'credit', amount: 10, reference_id: '  ' }],
    ])('validation: %s -> 400', async (_name, body) => {
        const acc = await createAccount();
        const res = await addTxn(acc.id, body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(await getBalance(acc.id)).toBe('0.00');
    });

    test('invalid account id format -> 400', async () => {
        const res = await addTxn('abc', { type: 'credit', amount: 10, reference_id: 'x' });
        expect(res.status).toBe(400);
    });

    test('unknown account -> 404', async () => {
        const res = await addTxn(MISSING_ID, { type: 'credit', amount: 10, reference_id: 'x' });
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
    });
});

describe('Get balance', () => {
    test('returns account_id and balance', async () => {
        const acc = await createAccount();
        const res = await api().get(`/accounts/${acc.id}/balance`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ account_id: acc.id, balance: '0.00' });
    });

    test('404 for unknown account, 400 for bad id', async () => {
        expect((await api().get(`/accounts/${MISSING_ID}/balance`)).status).toBe(404);
        expect((await api().get('/accounts/abc/balance')).status).toBe(400);
    });
});

describe('Transaction history', () => {
    let acc;
    beforeEach(async () => {
        acc = await createAccount();
        // 6 credits + 4 debits = 10 transactions
        await addTxn(acc.id, { type: 'credit', amount: 1000, reference_id: 'seed' });
        for (let i = 1; i <= 5; i++) {
            await addTxn(acc.id, { type: 'credit', amount: 10, reference_id: `c${i}` });
        }
        for (let i = 1; i <= 4; i++) {
            await addTxn(acc.id, { type: 'debit', amount: 5, reference_id: `d${i}` });
        }
    });

    test('returns latest first with pagination info', async () => {
        const res = await api().get(`/accounts/${acc.id}/transactions`);
        expect(res.status).toBe(200);
        expect(res.body.pagination).toEqual({
            current_page: 1, page_size: 10, total_records: 10, total_pages: 1,
        });
        const times = res.body.data.map((t) => new Date(t.created_at).getTime());
        expect(times).toEqual([...times].sort((a, b) => b - a));
        expect(res.body.data[0].reference_id).toBe('d4'); // sabse latest
    });

    test('filters by type', async () => {
        const credits = await api().get(`/accounts/${acc.id}/transactions?type=credit`);
        expect(credits.body.pagination.total_records).toBe(6);
        expect(credits.body.data.every((t) => t.type === 'credit')).toBe(true);

        const debits = await api().get(`/accounts/${acc.id}/transactions?type=debit`);
        expect(debits.body.pagination.total_records).toBe(4);
        expect(debits.body.data.every((t) => t.type === 'debit')).toBe(true);
    });

    test('paginates without overlap or gaps', async () => {
        const p1 = await api().get(`/accounts/${acc.id}/transactions?page=1&limit=4`);
        const p2 = await api().get(`/accounts/${acc.id}/transactions?page=2&limit=4`);
        const p3 = await api().get(`/accounts/${acc.id}/transactions?page=3&limit=4`);

        expect(p1.body.pagination.total_pages).toBe(3);
        expect(p1.body.data).toHaveLength(4);
        expect(p2.body.data).toHaveLength(4);
        expect(p3.body.data).toHaveLength(2);

        const ids = [...p1.body.data, ...p2.body.data, ...p3.body.data].map((t) => t.id);
        expect(new Set(ids).size).toBe(10);
    });

    test('page beyond range returns empty data', async () => {
        const res = await api().get(`/accounts/${acc.id}/transactions?page=99`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
        expect(res.body.pagination.total_records).toBe(10);
    });

    test.each(['type=abc', 'page=0', 'page=abc', 'limit=0', 'limit=500', 'limit=1.5'])(
        'invalid query %s -> 400',
        async (qs) => {
            const res = await api().get(`/accounts/${acc.id}/transactions?${qs}`);
            expect(res.status).toBe(400);
        }
    );

    test('404 for unknown account', async () => {
        const res = await api().get(`/accounts/${MISSING_ID}/transactions`);
        expect(res.status).toBe(404);
    });
});

describe('Immutability', () => {
    test('API has no update/delete endpoints', async () => {
        const acc = await createAccount();
        const t = await addTxn(acc.id, { type: 'credit', amount: 10, reference_id: 'i1' });
        const url = `/accounts/${acc.id}/transactions/${t.body.transaction.id}`;
        expect((await api().put(url).send({ amount: 1 })).status).toBe(404);
        expect((await api().patch(url).send({ amount: 1 })).status).toBe(404);
        expect((await api().delete(url)).status).toBe(404);
    });

    test('database trigger blocks UPDATE and DELETE', async () => {
        const acc = await createAccount();
        await addTxn(acc.id, { type: 'credit', amount: 10, reference_id: 'i1' });
        await expect(pool.query('UPDATE transactions SET amount = 1')).rejects.toThrow(/immutable/);
        await expect(pool.query('DELETE FROM transactions')).rejects.toThrow(/immutable/);
    });
});

describe('Transfer', () => {
    async function setup() {
        const a = await createAccount('A');
        const b = await createAccount('B');
        await addTxn(a.id, { type: 'credit', amount: 100, reference_id: 'seed-a' });
        await addTxn(b.id, { type: 'credit', amount: 50, reference_id: 'seed-b' });
        return { a, b };
    }
    const transfer = (body) => api().post('/transfers').send(body);

    test('moves money atomically: A 100->70, B 50->80', async () => {
        const { a, b } = await setup();
        const res = await transfer({
            from_account_id: a.id, to_account_id: b.id, amount: 30, reference_id: 'tr-1',
        });
        expect(res.status).toBe(201);
        expect(res.body.duplicate).toBe(false);
        expect(await getBalance(a.id)).toBe('70.00');
        expect(await getBalance(b.id)).toBe('80.00');
    });

    test('insufficient balance: nothing changes', async () => {
        const { a, b } = await setup();
        const res = await transfer({
            from_account_id: a.id, to_account_id: b.id, amount: 500, reference_id: 'tr-2',
        });
        expect(res.status).toBe(422);
        expect(await getBalance(a.id)).toBe('100.00');
        expect(await getBalance(b.id)).toBe('50.00');
    });

    test('missing destination: rolled back, source unchanged', async () => {
        const { a } = await setup();
        const res = await transfer({
            from_account_id: a.id, to_account_id: MISSING_ID, amount: 30, reference_id: 'tr-3',
        });
        expect(res.status).toBe(404);
        expect(await getBalance(a.id)).toBe('100.00');
    });

    test('duplicate transfer reference is applied only once', async () => {
        const { a, b } = await setup();
        const body = { from_account_id: a.id, to_account_id: b.id, amount: 30, reference_id: 'tr-4' };
        expect((await transfer(body)).status).toBe(201);
        const again = await transfer(body);
        expect(again.status).toBe(200);
        expect(again.body.duplicate).toBe(true);
        expect(await getBalance(a.id)).toBe('70.00');
        expect(await getBalance(b.id)).toBe('80.00');
    });

    test('same source and destination -> 400', async () => {
        const { a } = await setup();
        const res = await transfer({
            from_account_id: a.id, to_account_id: a.id, amount: 10, reference_id: 'tr-5',
        });
        expect(res.status).toBe(400);
    });

    test('transfer shows up in both histories', async () => {
        const { a, b } = await setup();
        await transfer({ from_account_id: a.id, to_account_id: b.id, amount: 30, reference_id: 'tr-6' });
        const ha = await api().get(`/accounts/${a.id}/transactions?type=debit`);
        const hb = await api().get(`/accounts/${b.id}/transactions?type=credit`);
        expect(ha.body.data[0].amount).toBe('30.00');
        expect(hb.body.data[0].amount).toBe('30.00');
    });
});