const { api, pool, resetDb, createAccount, addTxn, getBalance } = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

test('parallel debits never overdraw: balance 100, 8 x debit 20 -> exactly 5 succeed', async () => {
    const acc = await createAccount();
    await addTxn(acc.id, { type: 'credit', amount: 100, reference_id: 'seed' });

    const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
            addTxn(acc.id, { type: 'debit', amount: 20, reference_id: `p-${i}` })
        )
    );

    const ok = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 422).length;
    expect(ok).toBe(5);
    expect(rejected).toBe(3);
    expect(await getBalance(acc.id)).toBe('0.00');
});

test('parallel requests with same reference_id are applied once', async () => {
    const acc = await createAccount();
    const body = { type: 'credit', amount: 100, reference_id: 'same-ref' };

    const results = await Promise.all(Array.from({ length: 6 }, () => addTxn(acc.id, body)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(await getBalance(acc.id)).toBe('100.00');

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM transactions');
    expect(rows[0].n).toBe(1);
});

test('opposite parallel transfers do not deadlock and money is conserved', async () => {
    const a = await createAccount('A');
    const b = await createAccount('B');
    await addTxn(a.id, { type: 'credit', amount: 500, reference_id: 'seed-a' });
    await addTxn(b.id, { type: 'credit', amount: 500, reference_id: 'seed-b' });

    const jobs = [];
    for (let i = 0; i < 4; i++) {
        jobs.push(api().post('/transfers').send({
            from_account_id: a.id, to_account_id: b.id, amount: 10, reference_id: `ab-${i}`,
        }));
        jobs.push(api().post('/transfers').send({
            from_account_id: b.id, to_account_id: a.id, amount: 10, reference_id: `ba-${i}`,
        }));
    }
    const results = await Promise.all(jobs);
    expect(results.every((r) => r.status === 201)).toBe(true);

    const total = Number(await getBalance(a.id)) + Number(await getBalance(b.id));
    expect(total).toBe(1000);
});