import assert from "node:assert/strict";
import { readBookings } from "../src/booking-reader.js";

const rows = Array.from({ length: 1205 }, (_, index) => ({
  id: String(index), session_id: index % 2 ? "zumba" : "boxing",
  status: ["paid", "cancelled", "pending_payment", "pending_checkout", "confirmed"][index % 5],
  booking_date: index % 3 ? "2026-10-09" : null,
}));
const requests = [];
let failPage = -1;
const client = { from(table) {
  assert.equal(table, "bookings");
  const orders = [];
  const query = {
    select(columns) { assert.equal(columns, "*"); return query; },
    order(column, options) { orders.push([column, options]); return query; },
    async range(start, end) {
      assert.deepEqual(orders, [["created_at", { ascending: false }], ["id", { ascending: false }]]);
      requests.push([start, end]);
      return start === failPage ? { data: null, error: { message: "Schema cache temporarily unavailable" } }
        : { data: rows.slice(start, end + 1), error: null };
    },
  };
  return query;
} };

const result = await readBookings(client);
assert.equal(result.length, 1205);
assert.deepEqual(result.map(row => row.id), rows.map(row => row.id));
assert.equal(result[1204].sessionId, "boxing");
assert.equal(requests.length, 13);
assert.deepEqual(requests[0], [0, 99]);
assert.deepEqual(requests.at(-1), [1200, 1299]);
failPage = 100;
await assert.rejects(readBookings(client), /Schema cache temporarily unavailable/);
failPage = 0;
await assert.rejects(readBookings(client), /Schema cache temporarily unavailable/);
rows.length = 100;
failPage = -1;
assert.equal((await readBookings(client)).length, 100);
rows.length = 0;
assert.deepEqual(await readBookings(client), []);
console.log("PASS complete booking history: pages beyond 1,000 rows, deterministic ordering, legacy/cancelled/pending preservation, rejects partial reads and handles empty tables");
