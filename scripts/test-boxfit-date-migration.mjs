import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Like test-taster-database.mjs, accepts an isolated PGlite module path.
// This never connects to the customer database.
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
  await db.exec(`create table public.bookings (
    id text primary key, type text, session_id text, booking_date date,
    plan text, status text, amount numeric, user_id text, email text,
    payment_group_id text, gocardless_payment_id text,
    gocardless_billing_request_id text, created_at timestamptz
  );`);
  const fixtures = [
    ["root", "boxfit", "2026-10-15", "Pay as you go", "pending_payment", null],
    ["payg-20", "boxfit", "2026-10-20", "Pay as you go", "pending_payment", null],
    ["payg-27", "boxfit", "2026-10-27", "Pay as you go", "paid", "PM_FIXTURE"],
    ["month-20", "boxfit", "2026-10-20", "Membership — 1 class", "paid", "PM_MONTH"],
    ["cancelled-27", "boxfit", "2026-10-27", "Membership — 1 class", "cancelled", "PM_MONTH"],
    ["existing-thursday", "boxfit", "2026-10-22", "Pay as you go", "paid", "PM_OTHER"],
    ["taster-20", "boxfit", "2026-10-20", "Free taster", "confirmed", null],
    ["zumba-20", "zumba", "2026-10-20", "Pay as you go", "paid", "PM_ZUMBA"],
    ["november", "boxfit", "2026-11-20", "Pay as you go", "pending_checkout", null],
    ["undated", "boxfit", null, "Pay as you go", "pending_payment", null],
  ];
  for (const [id, session, date, plan, status, payment] of fixtures) {
    await db.query(`insert into bookings values ($1,'class',$2,$3,$4,$5,10,'member','fixture@example.test','root',$6,'BR_FIXTURE','2026-10-08T12:00:00Z')`, [id, session, date, plan, status, payment]);
  }
  const snapshot = async () => (await db.query('select *, booking_date::text as booking_date from bookings order by id')).rows;
  const before = await snapshot();
  const sql = await readFile(new URL('../supabase/migrations/20261012000000_move_boxfit_booking_dates.sql', import.meta.url), 'utf8');
  const first = await db.query(sql);
  assert.equal(Number(first.rows[0].moved_bookings), 4);
  const after = await snapshot();
  const movedIds = new Set(['payg-20', 'payg-27', 'month-20', 'cancelled-27']);
  for (const original of before) {
    const expected = movedIds.has(original.id)
      ? { ...original, booking_date: original.booking_date === '2026-10-20' ? '2026-10-22' : '2026-10-29' }
      : original;
    assert.deepEqual(after.find(row => row.id === original.id), expected, `${original.id}: only the intended booking date changes`);
  }
  assert.equal(Number((await db.query(sql)).rows[0].moved_bookings), 0);
  assert.deepEqual(await snapshot(), after, 'Rerunning does not change any dates twice or alter booking/payment history');
  console.log('PASS PostgreSQL date migration: 20→22 and 27→29 October, preserved IDs/prices/statuses/payments/cancellations, other classes/tasters/dates untouched, idempotent');
} finally {
  await db.close();
}
