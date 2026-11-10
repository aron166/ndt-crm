#!/usr/bin/env node
/**
 * Local-only sample data for screenshots and click-through. All data invented.
 *
 * Usage (always override, web/.env points at production):
 *   DATABASE_URL=postgresql://postgres:pg@localhost:55442/ndt_crm node scripts/seed-sample-local.mjs
 *
 * Refuses to run unless DATABASE_URL host is localhost or 127.0.0.1.
 *
 * Idempotency: every row this script owns has a fixed id >= 9000 (users,
 * persons, companies, contacts, leads, tasks, interactions, history). A run
 * deletes that id range (children first) and inserts again, in one
 * transaction. Reference data is NOT touched: hu_settlements and the bookable
 * machine (equipment) come from migrations; lead_statuses likewise. The only
 * shared row it edits is tenants.settings (jsonb merge of demoHosts + booking).
 * Interactions are append-only by app rule; the seed bypasses that on purpose.
 */
import pg from "pg";

const url = process.env.DATABASE_URL ?? "";
let host = "";
try { host = new URL(url).hostname; } catch { /* handled below */ }
if (host !== "localhost" && host !== "127.0.0.1") {
  console.error(`Refusing to run: DATABASE_URL host must be localhost or 127.0.0.1 (got "${host || "none"}").`);
  process.exit(1);
}

const T = 1; // tenant
const B = 9000; // id base for owned rows
const ARON = B + 1;
const PETER = B + 2;
const ph = (n) => `+36 30 000 ${String(n).padStart(4, "0")}`;

// A value inserted as raw SQL (relative timestamps).
const sql = (s) => ({ sql: s });
const ago = (d) => sql(`now() - interval '${d} days'`);
const inHours = (h) => sql(`now() + interval '${h} hours'`);
const inDays = (d) => sql(`now() + interval '${d} days'`);

const client = new pg.Client({ connectionString: url });
await client.connect();

async function ins(table, row) {
  const cols = Object.keys(row);
  const params = [];
  const vals = cols.map((c) => {
    const v = row[c];
    if (v && typeof v === "object" && "sql" in v) return v.sql;
    params.push(v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);
    return `$${params.length}`;
  });
  await client.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${vals.join(",")})`, params);
}

try {
  await client.query("BEGIN");

  // ── wipe owned rows (children first) ──
  for (const t of ["lead_status_history", "interactions", "tasks", "leads", "contacts", "persons", "companies", "users"]) {
    await client.query(`DELETE FROM ${t} WHERE id >= $1`, [B]);
  }

  // ── 1. users (users.email is the CRM login allow-list; password_hash is a dummy) ──
  await ins("users", { id: ARON, tenant_id: T, name: "Áron", email: "balogharon16@gmail.com", password_hash: "!sample", role: "admin" });
  await ins("users", { id: PETER, tenant_id: T, name: "Péter", email: "peter@example.invalid", password_hash: "!sample", role: "member" });

  // ── 2. tenant settings: demo hosts + booking window (merge, keeps other keys) ──
  const patch = { demoHosts: { aron: ARON, peter: PETER }, booking: { leaveBaseFrom: 360, visitFrom: 360, visitTo: 1140, homeBy: 1140 } };
  await client.query("UPDATE tenants SET settings = COALESCE(settings, '{}'::jsonb) || $1::jsonb WHERE id = $2", [JSON.stringify(patch), T]);

  const stl = new Map((await client.query("SELECT id, name FROM hu_settlements WHERE district IS NULL OR name = 'Budapest'")).rows.map((r) => [r.name, r.id]));
  const machine = (await client.query("SELECT id FROM equipment WHERE tenant_id=$1 AND bookable AND base_settlement_id IS NOT NULL ORDER BY id LIMIT 1", [T])).rows[0];
  if (!machine) throw new Error("No bookable machine with a base found (expected from migration 20261110140000_w8b_sites_machines).");

  // ── 3. companies, persons, contacts ──
  // [name, city, zip, street, county, lat, lng]
  const towns = [
    ["Minta Betonbau Kft.", "Győr", "9027", "Teszt utca 1.", "Győr-Moson-Sopron", 47.6875, 17.6504],
    ["Próba Útépítő Zrt.", "Sopron", "9400", "Példa út 2.", "Győr-Moson-Sopron", 47.6849, 16.5845],
    ["Teszt Hídgyártó Kft.", "Debrecen", "4024", "Minta tér 3.", "Hajdú-Bihar", 47.5316, 21.6273],
    ["Példa Előregyártó Kft.", "Szeged", "6720", "Próba köz 4.", "Csongrád", 46.253, 20.1414],
    ["Minta Mélyépítő Kft.", "Pécs", "7621", "Teszt sétány 5.", "Baranya", 46.0727, 18.2323],
    ["Próba Vasbeton Kft.", "Kecskemét", "6000", "Példa utca 6.", "Bács-Kiskun", 46.9062, 19.6913],
    ["Teszt Építőipari Zrt.", "Tatabánya", "2800", "Minta út 7.", "Komárom-Esztergom", 47.5692, 18.4048],
    ["Példa Födémgyártó Kft.", "Székesfehérvár", "8000", "Próba utca 8.", "Fejér", 47.186, 18.4221],
    ["Minta Szerkezetépítő Kft.", "Miskolc", "3525", "Teszt tér 9.", "Borsod-Abaúj-Zemplén", 48.1035, 20.7784],
    ["Próba Generálkivitelező Kft.", "Érd", "2030", "Példa köz 10.", "Pest", 47.3919, 18.9137],
  ];
  const cid = (i) => B + 1 + i;
  for (const [i, [name, city, zip, street, county, lat, lng]] of towns.entries()) {
    await ins("companies", {
      id: cid(i), tenant_id: T, name, vat_number: `9000000${i}`, country: "HU", county, city, address: street, zip_code: zip,
      site_zip: zip, site_city: city, site_street: street, site_county: county, site_country: "HU",
      lat, lng, updated_at: sql("now()"), account_type: "Lead", status: "active", notes: "Minta adat, nem valós cég.",
    });
  }
  const last = ["Minta", "Próba", "Teszt", "Példa"];
  const first = ["Anna", "Béla", "Csaba", "Dóra", "Elemér", "Fruzsina", "Gábor", "Hajnal", "István", "Júlia", "Károly", "Lilla"];
  for (let i = 0; i < 12; i++) {
    await ins("persons", { id: B + 1 + i, tenant_id: T, first_name: first[i], last_name: `${last[i % 4]}${i < 4 ? "" : " " + (i + 1)}`, email: `minta${i + 1}@example.invalid`, phone: ph(100 + i), updated_at: sql("now()") });
    await ins("contacts", { id: B + 1 + i, tenant_id: T, person_id: B + 1 + i, company_id: cid(i % 10), role: i < 10 ? "Műszaki vezető" : "Beszerző", is_primary: i < 10, phone: ph(200 + i), email: `iroda${i + 1}@example.invalid` });
  }
  const contactOf = (ci) => B + 1 + ci; // company index -> primary contact id (person i == company i for i<10)

  // ── 4/5. leads ──
  // [stage, company idx | null (private), owner, action, due, attempts, tier, intent, channel, interest, postcode, offerType]
  const open = [
    ["new", 0, PETER, "Első hívás", inHours(-30), 0, "C", "service_vague", "landing", "Födém vizsgálat", "9027"],
    ["new", 1, ARON, "Első hívás", inHours(2), 0, "B", "service_concrete", "landing", "Betonfedés mérés", "9400"],
    ["contacting", 2, PETER, "Újrahívás", inHours(-18), 2, "B", "service_concrete", "cold_email", "Híd pályalemez", null],
    ["contacting", 3, ARON, "Újrahívás", inHours(3), 3, "D", "service_vague", "cold_email", "Előregyártott elemek", "6720"],
    ["discovery_booked", 4, PETER, "Feltáró hívás", inHours(-5), 1, "A", "service_concrete", "referral", "Pincefal vizsgálat", "7621"],
    ["discovery_booked", null, ARON, "Feltáró hívás", inHours(4), 1, "C", "service_vague", "landing", "Családi ház alap", "2030"],
    ["qualified", 5, PETER, "Ajánlat készítés", inHours(5), 2, "A", "service_concrete", "referral", "Padlólemez", "6000", "service"],
    ["qualified", 6, ARON, "Ajánlat készítés", inHours(26), 1, "B", "rental", "cold_email", "Gépbérlés", null, "rental"],
    ["offer_sent", 7, PETER, "Ajánlat utánkövetés", inHours(30), 3, "B", "service_concrete", "landing", "Parkolóház födém", "8000", "service"],
    ["offer_sent", 8, ARON, "Ajánlat utánkövetés", inDays(2), 4, "D", "purchase", "cold_email", "Gépvásárlás", null, "purchase"],
    ["demo_booked", 0, PETER, "Demó előkészítés", inDays(3), 1, "A", "service_concrete", "referral", "Bemutató mérés", "9027", "service"],
    ["demo_booked", 1, ARON, "Demó előkészítés", inDays(5), 2, "B", "service_concrete", "landing", "Bemutató mérés", "9400", "service"],
    ["demo_done", 2, PETER, "Demó utáni hívás", inDays(7), 2, "A", "service_concrete", "referral", "Hídvizsgálat", "4024", "service"],
    ["demo_done", 3, ARON, "Demó utáni hívás", inDays(9), 3, "C", "rental", "cold_email", "Gépbérlés", "6720", "rental"],
    ["ordered", 9, PETER, "Szerződés egyeztetés", inDays(10), 4, "A", "service_concrete", "referral", "Teljes épület", "2030", "service"],
    ["ordered", null, ARON, "Időpont egyeztetés", inDays(6), 0, "E", "service_concrete", "landing", "Terasz vizsgálat", "6000", "service"],
  ];
  const recall = [
    ["recall", 4, PETER, "Visszahívás", "timing", 40, "C", "service_vague", "cold_email", "Későbbi projekt"],
    ["recall", 5, ARON, "Visszahívás", "budget_cycle", 75, "D", "service_vague", "landing", "Jövő évi keret"],
    ["recall", 6, PETER, "Visszahívás", "unreachable", 21, "E", "unknown", "cold_email", "Nem elérhető"],
  ];
  const closed = [
    ["lost", 7, ARON, "lost", "not_interested", "Nem érdekli", "E", "cold_email"],
    ["lost", 8, PETER, "lost", "disqualified", "Nem a célcsoport", "E", "cold_email"],
    ["won", 9, ARON, "won", null, null, "A", "referral"],
    ["won", 0, PETER, "won", null, null, "A", "referral"],
  ];
  let lid = B;
  const leadIds = [];
  const base = (ci, owner, stage, tier, channel, intent, interest) => ({
    tenant_id: T, company_id: ci == null ? null : cid(ci), contact_id: ci == null ? null : contactOf(ci), assigned_to_id: owner,
    source: channel === "landing" ? "Web" : channel, status: stage, subject: `Minta érdeklődés: ${interest}`, service_interest: interest,
    received_date: ago(12), tier, channel, buyer_type: ci == null ? "private" : "company", intent, campaign: "minta-2026-11",
    status_entered_at: ago(1 + (lid % 5)), custom_fields: { sample: true },
  });
  for (const [stage, ci, owner, action, due, attempts, tier, intent, channel, interest, pc, offer] of open) {
    const id = ++lid; leadIds.push(id);
    const q = pc ? { postcode: pc } : null;
    await ins("leads", { ...base(ci, owner, stage, tier, channel, intent, interest), id, outcome: "open", next_action: action, next_due: due, attempts, qualification: q, offer_type: offer ?? null,
      ...(stage === "demo_done" || stage === "ordered" ? { demo_done_at: ago(4), demo_credit_until: inDays(10) } : {}) });
  }
  for (const [stage, ci, owner, action, reason, days, tier, intent, channel, interest] of recall) {
    const id = ++lid; leadIds.push(id);
    await ins("leads", { ...base(ci, owner, stage, tier, channel, intent, interest), id, outcome: "open", next_action: action, recall_reason: reason, recall_date: inDays(days), next_due: inDays(days), attempts: 3 });
  }
  for (const [stage, ci, owner, outcome, reason, note, tier, channel] of closed) {
    const id = ++lid; leadIds.push(id);
    await ins("leads", { ...base(ci, owner, stage, tier, channel, "service_concrete", "Lezárt minta"), id, outcome, closed_at: ago(3), lost_reason: reason, lost_note: note, attempts: 2 });
  }

  // ── 6. bookings (tasks with starts_at) on working days of the next two weeks ──
  const today = (await client.query("SELECT CURRENT_DATE::text AS d")).rows[0].d;
  const wd = []; // day offsets (from today) of the next 10 working days
  for (let off = 1; wd.length < 10; off++) {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay() + off;
    if (dow % 7 !== 0 && dow % 7 !== 6) wd.push(off);
  }
  // [working day no, time, city, minutes, kind, lead idx (into open), owner, title]
  const bookings = [
    [1, "09:00", "Győr", 90, "job", 0, PETER, "Minta mérés, Győr"],
    [2, "08:00", "Sopron", 120, "single_machine_demo", 11, ARON, "Minta demó, Sopron"],
    [3, "07:30", "Debrecen", 480, "job", 12, PETER, "Minta egésznapos munka, Debrecen"],
    [5, "09:00", "Szeged", 150, "multi_unit_demo", 13, ARON, "Minta demó, Szeged"],
    [6, "08:30", "Győr", 90, "job", 10, PETER, "Minta bemutató mérés, Győr"],
    [8, "10:00", "Sopron", 90, "private", 5, ARON, "Minta magánmunka, Sopron"],
  ];
  for (const [i, [n, time, city, mins, kind, li, owner, title]] of bookings.entries()) {
    const ci = open[li][1];
    await ins("tasks", {
      id: B + 1 + i, tenant_id: T, assigned_to_id: owner, company_id: ci == null ? null : cid(ci), lead_id: leadIds[li], title,
      type: "field_visit", category: "revenue_generating", status: "created",
      starts_at: sql(`((CURRENT_DATE + ${wd[n - 1]}) + time '${time}') AT TIME ZONE 'Europe/Budapest'`),
      estimated_minutes: mins, booking_kind: kind, site_settlement_id: stl.get(city), site_address: "Minta telephely", site_source: "stated", equipment_id: machine.id, updated_at: sql("now()"),
    });
  }

  // ── 7. interactions + status history for 3 leads ──
  const calls = [
    [0, PETER, "Nem vette fel, később újra próbáljuk.", "no_answer", "qualification", 2],
    [2, PETER, "Beszéltünk, érdeklődik a híd vizsgálat iránt.", "callback_requested", "qualification", 5],
    [2, PETER, "Második hívás: egyeztettük a helyszínt.", "meeting_booked", "booking", 3],
    [12, PETER, "Demó után visszajelzés: elégedett, ajánlatot kér.", "meeting_booked", "offer_followup", 1],
    [14, PETER, "Szerződés részletek egyeztetve.", "meeting_booked", "booking", 1],
  ];
  for (const [i, [li, owner, notes, outcome, callType, d]] of calls.entries()) {
    const ci = open[li][1];
    await ins("interactions", {
      id: B + 1 + i, tenant_id: T, lead_id: leadIds[li], company_id: ci == null ? null : cid(ci), user_id: owner, type: "call", direction: "outbound",
      notes, outcome, call_type: callType, campaign: "minta-2026-11", occurred_at: ago(d),
    });
  }
  const hist = [
    [12, [[null, "new", "created", 9], ["new", "contacting", "call_no_answer", 8], ["contacting", "discovery_booked", "meeting_booked", 6], ["discovery_booked", "qualified", "qualified", 5], ["qualified", "offer_sent", "offer_sent", 4], ["offer_sent", "demo_booked", "demo_booked", 3], ["demo_booked", "demo_done", "demo_done", 1]]],
    [14, [[null, "new", "created", 8], ["new", "contacting", "call_no_answer", 7], ["contacting", "qualified", "qualified", 5], ["qualified", "ordered", "ordered", 1]]],
    [2, [[null, "new", "created", 6], ["new", "contacting", "call_no_answer", 4]]],
  ];
  let hid = B;
  for (const [li, steps] of hist) {
    for (const [from, to, event, d] of steps) {
      await ins("lead_status_history", { id: ++hid, tenant_id: T, lead_id: leadIds[li], from_status: from, to_status: to, event, actor_user_id: open[li][2], at: ago(d) });
    }
  }

  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("Seed failed, rolled back:", e.message);
  await client.end();
  process.exit(1);
}

const counts = {};
for (const t of ["users", "persons", "companies", "contacts", "leads", "tasks", "interactions", "lead_status_history"]) {
  counts[t] = Number((await client.query(`SELECT count(*) FROM ${t} WHERE id >= $1`, [B])).rows[0].count);
}
console.log("Sample rows (id >= 9000):", JSON.stringify(counts));
await client.end();
