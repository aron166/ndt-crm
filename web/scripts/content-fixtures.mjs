// Seed a LOCAL database with content-approval fixtures for screenshots and
// manual UI checks. Refuses to run against anything but localhost — web/.env
// is production and must never be touched by this script.
//
//   DATABASE_URL=postgresql://postgres:fixture@127.0.0.1:5439/ndtcrm node scripts/content-fixtures.mjs
//
// Idempotent: removes its own rows (titles starting "FX ") before inserting.
import pg from "pg";

const url = process.env.DATABASE_URL ?? "";
let parsedUrl;
try { parsedUrl = new URL(url); } catch { parsedUrl = null; }
if (!parsedUrl || !["127.0.0.1", "localhost"].includes(parsedUrl.hostname) || parsedUrl.searchParams.has("host")) {
  console.error("Refusing: DATABASE_URL must point at localhost.");
  process.exit(1);
}
const c = new pg.Client({ connectionString: url });
await c.connect();
const q = (s, p) => c.query(s, p);

// Users matching the real login emails, so a real Supabase session maps to them.
async function user(name, email) {
  const r = await q(
    `INSERT INTO users (tenant_id, name, email, password_hash, role) VALUES (1,$1,$2,'supabase-auth','admin')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [name, email]);
  return r.rows[0].id;
}
const aron = await user("Áron", "balogharon16@gmail.com");
const peter = await user("Nagy Péter", "peter.z.nagy@controllabor.hu");
await q(`UPDATE tenants SET settings = jsonb_set(CASE WHEN jsonb_typeof(settings) = 'object' THEN settings ELSE '{}'::jsonb END, '{contentReviewers}', $1::jsonb, true) WHERE id = 1`,
  [JSON.stringify([aron, peter])]);

await q(`DELETE FROM content_reviews WHERE version_id IN (SELECT v.id FROM content_versions v JOIN content_items i ON i.id = v.item_id WHERE i.title LIKE 'FX %')`);
await q(`UPDATE content_items SET current_version_id = NULL, live_version_id = NULL WHERE title LIKE 'FX %'`);
await q(`DELETE FROM content_items WHERE title LIKE 'FX %'`);
const camp = (await q(`INSERT INTO campaigns (tenant_id, name, slug) VALUES (1,'Hideg levél v0','cold-email-v0')
  ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`)).rows[0].id;

const V1 = `**Tárgy:** betonvas a meglévő szerkezetben

Tisztelt Tóth Úr!

2020-ban a Millér-patak hídjának acélszerkezetét vizsgáltuk Önöknek, 2021-ben pedig a Lánchíd-munkán dolgoztunk együtt.

Most egy új mérési képesség miatt keresem: georadarral és lézeres letapogatással megmutatjuk, hol fut a betonvas a meglévő szerkezetben, mekkora a betontakarás és az átmérő: bontás és sugárzás nélkül, egyoldali hozzáféréssel.

Van most olyan műtárgyuk, ahol a meglévő vaskiosztásról nincs meg a megvalósulási terv?

Üdvözlettel,
Balogh Áron
Uphill Trade`;
const V2 = V1.replace("Most egy új mérési képesség miatt keresem:", "Egy új mérési képességről írok, ami a „bontás előtti” kérdést oldja meg:")
  .replace("Van most olyan műtárgyuk,", "Van jelenleg olyan műtárgyuk,");

async function item({ title, category, format, purpose, status, versions, reviews = [], live = null, campaign = camp, daysAgo = 0, needsHumanAsset = false }) {
  const it = (await q(`INSERT INTO content_items (tenant_id, campaign_id, channel, content_type, title, body, status, source, category, format, purpose, needs_human_asset, created_at, updated_at)
    VALUES (1,$1,'email','email',$2,$3,$4,'fixtures',$5,$6,$7,$8, now() - ($9 || ' days')::interval, now() - ($9 || ' days')::interval) RETURNING id`,
    [campaign, title, versions.at(-1).body, status, category, format, purpose, needsHumanAsset, String(daysAgo)])).rows[0].id;
  const ids = [];
  for (const [i, v] of versions.entries()) {
    const r = await q(`INSERT INTO content_versions (tenant_id, item_id, number, body, author_type, author_user_id, author_app, change_note, based_on_version_id, created_at)
      VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8, now() - ($9 || ' days')::interval + ($10 || ' hours')::interval) RETURNING id`,
      [it, i + 1, v.body, v.author, v.author === "user" ? aron : null, v.author === "user" ? null : "content-revise", v.note ?? null, ids.at(-1) ?? null, String(daysAgo), String(i + 1)]);
    ids.push(r.rows[0].id);
  }
  await q(`UPDATE content_items SET current_version_id = $1, live_version_id = $2 WHERE id = $3`,
    [ids.at(-1), live === null ? null : ids[live], it]);
  for (const r of reviews) {
    await q(`INSERT INTO content_reviews (tenant_id, version_id, reviewer_user_id, verdict, comment, updated_at) VALUES (1,$1,$2,$3,$4, now())`,
      [ids[r.v], r.who === "aron" ? aron : peter, r.verdict, r.comment ?? null]);
  }
  return it;
}

const main = await item({
  title: "FX A-Híd: 1. érintés", category: "email", format: "plain_text_email", purpose: "Hideg levél v0, 1. érintés",
  status: "in_review", daysAgo: 4,
  versions: [
    { body: V1, author: "import", note: "Átvéve a growth/campaigns/cold-email-v0/drafts/a-hid.md fájlból" },
    { body: V2, author: "ai", note: "v2 a v1 alapján.\n1. „Túl általános a nyitás” → a második bekezdés most a bontás előtti kérdéssel indul.\n2. „Kerüld a »most« szót kétszer” → a kérdésben „jelenleg” szerepel." },
  ],
  reviews: [
    { v: 0, who: "peter", verdict: "changes", comment: "Túl általános a nyitás, és a „most” kétszer szerepel." },
    { v: 1, who: "peter", verdict: "approve" },
  ],
});
await item({ title: "FX Setter szkript: bejövő hívás", category: "script", format: "phone_script", purpose: "Setter szkript", status: "in_review", daysAgo: 1,
  versions: [{ body: "## Nyitás\n\nJó napot kívánok, Balogh Áron vagyok az Uphill Trade-től…\n\n## Kérdések\n\n1. Van most futó projektjük?\n2. Mikorra kellene a felmérés?", author: "import" }] });
await item({ title: "FX Demó ajánlat", category: "email", format: "plain_text_email", purpose: "Demó ajánlat", status: "changes_requested", daysAgo: 2,
  versions: [{ body: "Tisztelt Ügyfelünk!\n\nSzívesen bemutatjuk a mérést a helyszínen.", author: "import" }],
  reviews: [{ v: 0, who: "aron", verdict: "changes", comment: "Legyen benne a konkrét időtartam (kb. 2 óra)." }] });
await item({ title: "FX BirdsView hirdetés: rövid vágás", category: "video", format: "9x16_video", purpose: "Meta hirdetés", status: "ai_working", daysAgo: 1, needsHumanAsset: true,
  versions: [{ body: "Forgatókönyv: 15 mp, nyitókép a födémről…", author: "import" }],
  reviews: [{ v: 0, who: "aron", verdict: "rewrite", comment: "Rövidebb, 10 mp, és a végén logó." }] });
await item({ title: "FX Aláírás és jogi lábléc", category: "other", format: null, purpose: "Aláírás", status: "live", live: 0, daysAgo: 6,
  versions: [{ body: "Balogh Áron\nUphill Trade Kft.\n+36 …", author: "user" }],
  reviews: [{ v: 0, who: "aron", verdict: "approve" }, { v: 0, who: "peter", verdict: "approve" }] });
await q(`UPDATE content_items SET claimed_at = now(), claimed_by = 'content-revise', claimed_from = 'rewrite_requested' WHERE title = 'FX BirdsView hirdetés: rövid vágás'`);

console.log(`fixtures ready: reviewers ${aron}, ${peter}; main item ${main}`);
await c.end();
