import { toCamel } from "./storage-shape.js";

// Supabase limits each response (normally to 1,000 rows). Fetch small,
// deterministically ordered pages so older bookings are not silently omitted.
export async function readBookings(client) {
  const pageSize = 100;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("bookings").select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    // A failed read is not an empty table. Do not replace saved bookings with
    // an empty or partially downloaded list during a schema/network failure.
    if (error) throw new Error(error.message || "Could not load bookings.");
    if (!Array.isArray(data)) throw new Error("Could not load bookings.");
    rows.push(...data);
    if (data.length < pageSize) return rows.map(toCamel);
  }
}
