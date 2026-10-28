CREATE
EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE accounts
(
    id         UUID PRIMARY KEY        DEFAULT gen_random_uuid(),
    name       TEXT           NOT NULL CHECK (length(trim(name)) > 0),
    balance    NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TABLE transactions
(
    id           UUID PRIMARY KEY        DEFAULT gen_random_uuid(),
    account_id   UUID           NOT NULL REFERENCES accounts (id),
    type         TEXT           NOT NULL CHECK (type IN ('credit', 'debit')),
    amount       NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
    description  TEXT,
    reference_id TEXT           NOT NULL CHECK (length(trim(reference_id)) > 0),
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT uq_account_reference UNIQUE (account_id, reference_id)
);

CREATE INDEX idx_txn_account_created
    ON transactions (account_id, created_at DESC);

-- Immutability: UPDATE/DELETE DB level pe bhi block
CREATE FUNCTION prevent_txn_modification() RETURNS trigger AS $$
BEGIN
  RAISE
EXCEPTION 'Transactions are immutable';
END;
$$
LANGUAGE plpgsql;

CREATE TRIGGER trg_txn_immutable
    BEFORE UPDATE OR
DELETE
ON transactions
  FOR EACH ROW EXECUTE FUNCTION prevent_txn_modification();