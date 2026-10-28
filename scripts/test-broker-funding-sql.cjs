// Run with PGlite installed in .next/transfer-sql-test (no production DB access).
const { PGlite } = require('../.next/transfer-sql-test/node_modules/@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        'SELECT nullif(current_setting(''test.user_id'', true), '''')::uuid';
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE portfolios(id uuid PRIMARY KEY, user_id uuid, name text);
      CREATE TABLE trades(id uuid PRIMARY KEY, user_id uuid, portfolio_id uuid, execution_date timestamptz);
      CREATE TABLE money_buckets(id uuid PRIMARY KEY, user_id uuid, portfolio_id uuid, name text, currency text, current_amount numeric DEFAULT 0);
      CREATE TABLE cash_activities(id uuid PRIMARY KEY, user_id uuid, portfolio_id uuid, type text, amount numeric(18,4),
        category text, date timestamptz, bucket_id uuid, is_transfer boolean, currency text, rate_at_time numeric,
        original_amount numeric(18,4), note text);
      CREATE TABLE bucket_activities(id uuid PRIMARY KEY, user_id uuid, portfolio_id uuid, bucket_id uuid,
        type text, amount numeric(18,4), date timestamptz, currency text, rate_at_time numeric, original_amount numeric(18,4), note text);
    `);
    for (const file of ['013_portfolio_roles_and_brokerage_accounts.sql', '014_enforce_cash_management_bucket_boundary.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8'));
    }
    await db.exec("ALTER TABLE brokerage_accounts ADD COLUMN kind text NOT NULL DEFAULT 'cash'");
    const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/018_bucket_broker_transfers.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Repeat application must be safe.

    const user = '10000000-0000-0000-0000-000000000001';
    const bank = '20000000-0000-0000-0000-000000000001';
    const broker = '20000000-0000-0000-0000-000000000002';
    const thbBucket = '30000000-0000-0000-0000-000000000001';
    const usdBucket = '30000000-0000-0000-0000-000000000002';
    const usdAccount = '40000000-0000-0000-0000-000000000001';
    const thbAccount = '40000000-0000-0000-0000-000000000002';
    await db.exec(`
      SET test.user_id = '${user}';
      INSERT INTO auth.users VALUES ('${user}');
      INSERT INTO portfolios VALUES ('${bank}', '${user}', 'Bucket', 'cash_management'), ('${broker}', '${user}', 'Dime', 'trading');
      INSERT INTO money_buckets VALUES ('${thbBucket}', '${user}', '${bank}', 'Bank THB', 'THB', 0), ('${usdBucket}', '${user}', '${bank}', 'Bank USD', 'USD', 0);
      INSERT INTO brokerage_accounts(id,user_id,portfolio_id,name,currency) VALUES ('${usdAccount}','${user}','${broker}','USD','USD'), ('${thbAccount}','${user}','${broker}','THB','THB');
      INSERT INTO cash_activities(id,user_id,portfolio_id,bucket_id,type,amount,currency,original_amount,rate_at_time) VALUES
        (gen_random_uuid(),'${user}','${bank}','${thbBucket}','DEPOSIT',10000/36.5,'THB',10000,36.5),
        (gen_random_uuid(),'${user}','${bank}','${usdBucket}','DEPOSIT',500,'USD',500,1);
    `);
    const transfer = (id, source = thbBucket, target = usdAccount, amount = 3360, received = 100, fee = 10, rate = 33.5) => db.query(
      'SELECT transfer_bucket_to_broker($1,$2,$3,$4,$5,$6,$7,36.5) AS result', [id, source, target, amount, received, fee, rate]);
    let checks = 0;
    const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
    const id = '50000000-0000-0000-0000-000000000001';
    await check('Both ledgers preserve actual denominations and execution rate', async () => {
      const { rows } = await transfer(id);
      const saved = rows[0].result;
      assert.equal(Number(saved.cash_activity.original_amount), 3360);
      assert.equal(Number(saved.cash_activity.rate_at_time), 33.5);
      assert.equal(Number(saved.brokerage_entry.amount), 100);
      assert.equal(saved.brokerage_entry.currency, 'USD');
      assert.equal(saved.cash_activity.funding_details.fee, 10);
    });
    await check('Duplicate retry credits the broker once', async () => {
      const { rows } = await transfer(id);
      assert.equal(Number(rows[0].result.brokerage_balance), 100);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM brokerage_cash_entries')).rows[0].n, 1);
    });
    await check('Reusing a transfer ID with different amounts is rejected', async () => {
      await assert.rejects(transfer(id, thbBucket, usdAccount, 6710, 200), /different amounts/);
    });
    await check('USD to THB transfers use THB per USD in the opposite direction', async () => {
      const { rows } = await transfer('50000000-0000-0000-0000-000000000002', usdBucket, thbAccount, 101, 3350, 1);
      assert.equal(Number(rows[0].result.brokerage_entry.amount), 3350);
      assert.equal(Number(rows[0].result.cash_activity.amount), 101);
    });
    await check('Same denomination transfer deducts only the declared fee', async () => {
      const { rows } = await transfer('50000000-0000-0000-0000-000000000003', thbBucket, thbAccount, 510, 500, 10);
      assert.equal(Number(rows[0].result.brokerage_entry.amount), 500);
    });
    await check('Invalid exchange result and insufficient funds are rejected', async () => {
      await assert.rejects(transfer('50000000-0000-0000-0000-000000000004', thbBucket, usdAccount, 3360, 500), /does not match/);
      await assert.rejects(transfer('50000000-0000-0000-0000-000000000004', thbBucket, thbAccount, 100000, 99990), /Insufficient/);
    });
    await check('Failure after broker insert rolls back both monetary legs', async () => {
      const collision = '50000000-0000-0000-0000-000000000005';
      await db.exec(`INSERT INTO bucket_activities(id,user_id,portfolio_id,bucket_id) VALUES ('${collision}','${user}','${bank}','${thbBucket}')`);
      await assert.rejects(transfer(collision), /duplicate key/);
      const { rows } = await db.query('SELECT count(*)::int AS n FROM brokerage_cash_entries WHERE id=$1', [collision]);
      assert.equal(rows[0].n, 0);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM cash_activities WHERE id=$1', [collision])).rows[0].n, 0);
    });
    await check('Linked bank records cannot be deleted or edited alone', async () => {
      await assert.rejects(db.query('DELETE FROM cash_activities WHERE id=$1', [id]), /one side/);
      await assert.rejects(db.query('UPDATE cash_activities SET original_amount=1 WHERE id=$1', [id]), /one side/);
      await assert.rejects(db.query('DELETE FROM bucket_activities WHERE id=$1', [id]), /one side/);
    });
    await check('Another user cannot fund from these accounts', async () => {
      await db.exec("SET test.user_id = '10000000-0000-0000-0000-000000000002'");
      await assert.rejects(transfer('50000000-0000-0000-0000-000000000006'), /Invalid source/);
    });
    await check('Empty legacy duplicate wallets are removed without touching ledgers', async () => {
      await db.exec(`
        INSERT INTO brokerage_accounts(id,user_id,portfolio_id,name,currency,kind) VALUES
          ('40000000-0000-0000-0000-000000000010','${user}','${broker}','เงินสด USD','USD','cash'),
          ('40000000-0000-0000-0000-000000000011','${user}','${broker}','d','USD','cash');
      `);
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/019_remove_empty_duplicate_cash_wallets.sql'), 'utf8'));
      const { rows } = await db.query("SELECT count(*)::int AS n FROM brokerage_accounts WHERE id='40000000-0000-0000-0000-000000000011'");
      assert.equal(rows[0].n, 0);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM brokerage_cash_entries')).rows[0].n, 3);
    });
    console.log(`${checks} PostgreSQL funding checks passed.`);
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
