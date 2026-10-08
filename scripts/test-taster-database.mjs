import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Run with a PGlite module path supplied as argv[2]; see docs/CLASS_BOOKING_CHANGES.md.
// This uses isolated embedded PostgreSQL, never the hosted customer database.
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.bookings (
      id text primary key, session_id text, session_name text, name text, email text, user_id text, plan text,
      status text, amount numeric,
      ${process.argv[3] ? "" : "booking_date date, payment_group_id text, gocardless_payment_id text,"}
      created_at timestamptz default now()
    );
    insert into bookings (id,session_id,email,user_id,plan,status) values
      ('historic-1','zumba','past@example.test','past-member','Free taster','cancelled'),
      ('historic-duplicate','zumba','past@example.test','past-member','Free taster','confirmed');
    insert into bookings (id,session_id,email,user_id,plan,status,amount) values
      ('paid-class','zumba','paid@example.test','paid-member','Membership — 1 class','paid',35),
      ('pending-class','zumba','pending@example.test','pending-member','Pay as you go','pending_payment',10),
      ('unfinished','zumba','checkout@example.test','checkout-member','Pay as you go','pending_checkout',10),
      ('cancelled-class','zumba','cancelled@example.test','cancelled-member','Pay as you go','cancelled',10),
      ('legacy-boxing','boxing','boxing@example.test','boxing-member','Free taster','confirmed',0),
      ('bank-course','self_defence','course@example.test','course-member','Course (bank transfer)','pending_payment',90);
  `);
  const snapshot = () => db.query('select id,session_id,session_name,name,email,user_id,plan,status,amount,created_at from bookings order by id');
  const historyBefore = (await snapshot()).rows;
  const allocationSql = await readFile(new URL('../supabase/SQL_EDITOR_BOOKING_ALLOCATION.sql', import.meta.url), 'utf8');
  await db.exec(allocationSql);
  await db.exec(allocationSql);
  assert.deepEqual((await snapshot()).rows, historyBefore, "allocation SQL preserves every existing booking when run twice");
  const sql = await readFile(process.argv[3] || new URL('../supabase/migrations/20261007000000_lifetime_class_tasters.sql',import.meta.url),'utf8');
  await db.exec(sql);
  await db.exec(sql); // The SQL Editor file and migration can be re-run safely.
  assert.deepEqual((await snapshot()).rows, historyBefore, "running SQL twice preserves every original booking and its status, amount, member and timestamps");
  const insert = (id,user,email,session='zumba') => db.query(`insert into bookings (id,session_id,user_id,email,plan,status,amount,booking_date,payment_group_id)
    values ($1,$2,$3,$4,'Taster (bank transfer)','pending_payment',5,'2026-10-16',$1)`,[id,session,user,email]);
  await assert.rejects(insert('new-historical','past-member','PAST@example.test'),/Only one lifetime taster/);
  await db.query("update bookings set status='cancelled' where id='historic-duplicate'");
  await insert('pending-1','new-member','new@example.test');
  await assert.rejects(insert('duplicate-pending','new-member','new@example.test'),/Only one lifetime taster/);
  await assert.rejects(insert('duplicate-email','different-member',' NEW@EXAMPLE.TEST '),/Only one lifetime taster/);
  await assert.rejects(insert('duplicate-user','new-member','changed@example.test'),/Only one lifetime taster/);
  await db.query("update bookings set booking_date='2026-10-23' where id='pending-1'");
  await db.query(`insert into bookings (id,session_id,email,user_id,plan,status,amount,booking_date,payment_group_id)
    values ('pending-1','zumba','new@example.test','new-member','Taster (bank transfer)','pending_payment',5,'2026-10-23','pending-1')
    on conflict (id) do update set booking_date=excluded.booking_date`);
  await db.query("update bookings set gocardless_payment_id='PM1' where id='pending-1'");
  await assert.rejects(db.query("update bookings set gocardless_payment_id=null where id='pending-1'"),/cannot be booked again/);
  await db.query("update bookings set status='paid' where id='pending-1'");
  await db.query("update bookings set status='cancelled' where id='pending-1'");
  await assert.rejects(db.query("update bookings set status='pending_payment' where id='pending-1'"),/cannot be booked again/);
  await assert.rejects(db.query("update bookings set plan='Pay as you go' where id='pending-1'"),/cannot change class or member/);
  await assert.rejects(db.query("update bookings set email='different@example.test' where id='pending-1'"),/cannot change class or member/);
  await assert.rejects(insert('new-after-cancel','new-member','new@example.test'),/Only one lifetime taster/);
  await db.query("delete from bookings where id='pending-1'");
  await assert.rejects(insert('pending-1','new-member','new@example.test'),/Only one lifetime taster/);
  await assert.rejects(insert('after-delete','new-member','new@example.test'),/Only one lifetime taster/);
  await insert('other-class','new-member','new@example.test','boxfit');
  await db.query("insert into bookings (id,session_id,email,user_id,plan,status) values ('regular','zumba','new@example.test','new-member','Pay as you go','paid')");
  await db.query("insert into bookings (id,session_id,email,user_id) values ('no-plan','zumba','new@example.test','new-member')");
  await db.exec("grant select, insert, update on bookings to anon; set role anon");
  await insert('browser-first','browser-member','browser@example.test');
  await assert.rejects(insert('browser-second','browser-member','browser@example.test'),/Only one lifetime taster/);
  await assert.rejects(db.query("select * from public.class_taster_claims"),/permission denied/);
  await db.exec("reset role; set role service_role");
  assert.ok((await db.query("select * from public.class_taster_claims")).rows.length > 0);
  await db.exec("reset role");
  const beforeDiagnostics = (await snapshot()).rows;
  await db.exec(await readFile(new URL('../supabase/SQL_EDITOR_BOOKING_DIAGNOSTICS.sql', import.meta.url), 'utf8'));
  assert.deepEqual((await snapshot()).rows, beforeDiagnostics, "read-only diagnostics preserve all bookings");
  console.log("PASS actual PostgreSQL migration: preserves history, enforces one lifetime taster by email/member, resumes one pending row, survives cancellation/deletion, isolates class eligibility and protects claims");
} finally { await db.close(); }
