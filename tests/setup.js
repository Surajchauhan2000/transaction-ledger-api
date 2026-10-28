// App import hone se pehle chalta hai. dotenv existing env var ko override nahi karta,
// isliye tests hamesha test DB pe chalenge.
process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || 'postgres://ledger:ledger@localhost:5432/ledger_test';

// Safety: galti se asli DB pe tests na chal jayein
if (!process.env.DATABASE_URL.includes('test')) {
    throw new Error('Refusing to run tests on a non-test database');
}