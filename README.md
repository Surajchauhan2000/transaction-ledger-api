# Transaction Ledger API

A backend API for a simple transaction ledger: create accounts, post credit/debit
transactions, check balances, and view paginated history. Includes an atomic money
transfer endpoint (bonus).

**Stack:** Node.js, Express, PostgreSQL, Zod, Jest + Supertest, Docker Compose

## Quick start (Docker, recommended)

```bash
docker compose up --build
```

This starts PostgreSQL (tables are created automatically) and the API on
`http://localhost:3000`. No Node.js or PostgreSQL installation is required.

## Local development (without the app container)

```bash
docker compose up -d db
npm install
cp .env.example .env
npm run dev
```

## Prerequisites

- Node.js 18+
- Docker Desktop (for PostgreSQL)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create env file
cp .env.example .env        # Windows: copy .env.example .env

# 3. Start PostgreSQL (tables are created automatically on first start)
docker compose up -d

# 4. Start the API
npm run dev                 # or: npm start
```

The API runs on `http://localhost:3000`.

If the tables were not created, run the migration manually:
```bash
docker compose exec -T db psql -U ledger -d ledger < migrations/001_init.sql
```

## Running tests

Tests use a separate database (`ledger_test`) so your data is never touched.

```bash
docker compose exec db psql -U ledger -d ledger -c "CREATE DATABASE ledger_test;"
docker compose exec -T db psql -U ledger -d ledger_test < migrations/001_init.sql
npm test
```

The suite covers validations, duplicate handling, pagination, immutability,
transfers, and concurrency (parallel debits, parallel duplicate references,
opposite-direction transfers).

## Project structure

```
src/
  app.js, server.js
  config/          DB pool + withTransaction helper
  routes/          URL -> controller mapping
  controllers/     HTTP request/response handling
  services/        Business logic (credit, debit, transfer)
  repositories/    SQL queries
  validators/      Zod schemas
  middleware/      validate, error handler
  errors/          AppError
migrations/        SQL schema
tests/             Jest + Supertest
```

## Design decisions

**Atomicity.** Every write runs inside one DB transaction (`BEGIN ... COMMIT`).
The account row is locked with `SELECT ... FOR UPDATE`, then the duplicate check,
balance update and transaction insert happen together. Any failure triggers
`ROLLBACK`, so nothing is partially saved.

**Concurrency.** The row lock serializes parallel requests on the same account.
This prevents overdrafts and double-applying a duplicate `reference_id`.
Transfers lock both accounts in a single query ordered by id, which avoids
deadlocks between opposite transfers (A->B and B->A).

**Database constraints (last line of defense).**
- `CHECK (balance >= 0)`: balance can never go negative
- `CHECK (amount > 0)` and `CHECK (type IN ('credit','debit'))`
- `UNIQUE (account_id, reference_id)`: duplicate prevention per account
- Foreign key `transactions.account_id -> accounts.id`
- Trigger blocking `UPDATE` and `DELETE` on `transactions` (immutability)

**Money.** Stored as `NUMERIC(18,2)`, never floats. The debit balance check is done
inside SQL (`WHERE balance >= amount`). Amounts are returned as strings (e.g. `"70.00"`)
to avoid floating-point rounding on the client.

**Validation.** Zod schemas validate body, params and query. Unknown fields are
rejected, so a client cannot set `balance` when creating an account.

## API documentation

Base URL: `http://localhost:3000`. All bodies and responses are JSON.

### Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [{ "field": "amount", "message": "Amount must be greater than 0" }]
  }
}
```

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body, params or query (bad type, amount, UUID, pagination) |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 404 | `ACCOUNT_NOT_FOUND` | Account does not exist |
| 404 | `ROUTE_NOT_FOUND` | Unknown route |
| 422 | `INSUFFICIENT_BALANCE` | Debit or transfer exceeds balance |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### 1. Create account

`POST /accounts`

```json
{ "name": "Suraj" }
```

**201 Created**
```json
{
  "id": "3f2b8c1e-5a7d-4c9e-9b21-8d4f6a1e7c20",
  "name": "Suraj",
  "balance": "0.00",
  "created_at": "2026-10-28T10:00:00.000Z"
}
```

### 2. Add transaction

`POST /accounts/:id/transactions`

| Field | Rules |
|---|---|
| `type` | required, `credit` or `debit` |
| `amount` | required, > 0, max 2 decimals (number or numeric string) |
| `description` | optional, max 500 chars |
| `reference_id` | required, 1-100 chars, unique per account |

```json
{ "type": "credit", "amount": 100, "description": "salary", "reference_id": "ref-1" }
```

**201 Created**
```json
{
  "transaction": {
    "id": "uuid", "account_id": "uuid", "type": "credit", "amount": "100.00",
    "description": "salary", "reference_id": "ref-1", "created_at": "..."
  },
  "balance": "100.00",
  "duplicate": false
}
```

**200 OK (duplicate `reference_id` for the same account).** No new transaction is
created and the balance is unchanged. The original transaction is returned with `"duplicate": true`.

Errors: 400, 404, 422.

### 3. Get balance

`GET /accounts/:id/balance`

**200 OK**
```json
{ "account_id": "uuid", "balance": "70.00" }
```
Errors: 400 (bad id), 404.

### 4. Get transaction history

`GET /accounts/:id/transactions?type=&page=&limit=`

| Param | Default | Rules |
|---|---|---|
| `type` | both | `credit` or `debit` |
| `page` | 1 | integer >= 1 |
| `limit` | 10 | integer 1-100 |

Sorted latest first (`created_at DESC`).

**200 OK**
```json
{
  "data": [ { "id": "...", "type": "debit", "amount": "30.00", "...": "..." } ],
  "pagination": { "current_page": 1, "page_size": 10, "total_records": 14, "total_pages": 2 }
}
```
Errors: 400, 404.

### 5. Transfer money (bonus)

`POST /transfers`

```json
{
  "from_account_id": "uuid",
  "to_account_id": "uuid",
  "amount": 30,
  "description": "rent",
  "reference_id": "tr-1"
}
```

**201 Created**
```json
{
  "transfer": {
    "reference_id": "tr-1",
    "from_account_id": "uuid", "to_account_id": "uuid", "amount": "30.00",
    "from_balance": "70.00", "to_balance": "80.00",
    "debit_transaction": { "...": "..." },
    "credit_transaction": { "...": "..." }
  },
  "duplicate": false
}
```

**200 OK** with `"duplicate": true` if the same transfer `reference_id` was already processed.

Errors: 400 (same account, invalid data), 404 (either account missing), 422 (insufficient balance).
The debit and credit happen in one DB transaction, so a partial transfer is impossible.

## Assumptions

1. Single currency; no currency field. Amounts have at most 2 decimal places.
2. Account `id` and transaction `id` are server-generated UUIDs.
3. Debits can never take the balance below 0 (no overdraft).
4. A duplicate `reference_id` for the same account returns **200** with the existing
   transaction (idempotent behavior), not an error. The same `reference_id` is
   allowed on different accounts. `reference_id` is trimmed before comparison.
5. A duplicate is detected by `reference_id` only; the other fields of the retried
   request are not compared.
6. Transactions are immutable. There are no update or delete endpoints, and a DB
   trigger blocks changes. Accounts cannot be updated or deleted either.
7. Transfers create two ledger entries (debit on source, credit on destination) with
   `reference_id` values `transfer:<ref>:out` and `transfer:<ref>:in`.
   Transfer `reference_id` is unique per source account.
8. Transfers between the same account are rejected.
9. History `limit` is capped at 100.
10. No authentication or authorization (out of scope for this assignment).
11. Timestamps are stored in UTC (`TIMESTAMPTZ`).