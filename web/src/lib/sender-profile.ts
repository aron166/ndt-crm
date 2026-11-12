// A sender's name and phone, as the launch check and the e-mail preview read them: users.name and
// users.settings.phone (lib/campaigns/preview.ts emailContext). PURE validation, no DB.
// Hungarian error text is PROPOSAL until Áron approves it.

export type SenderProfile = { ok: true; name: string; phone: string | null } | { ok: false; error: string };

const BAD_PHONE = "Érvénytelen telefonszám. Példa: +36 30 123 4567";

/** National digits (no leading 0) of a Hungarian number, grouped the way it is read aloud. */
function groupHu(n: string): string {
  if (n.length === 9) return `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`; // mobile: 30 123 4567
  return n[0] === "1" ? `1 ${n.slice(1, 4)} ${n.slice(4)}` : `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`; // Budapest, other landline
}

/** "+36 30 123 4567" for any usual Hungarian spelling; a foreign +number kept as typed; null = not a phone. */
function normalizePhone(raw: string): string | null {
  if (/[^\d\s()+\-./]/.test(raw)) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("06")) d = "+36" + d.slice(2);
  if (!/^\+?\d+$/.test(d) || d.indexOf("+") > 0) return null;
  if (d.startsWith("+36")) {
    const n = d.slice(3);
    return /^[1-9]\d{7,8}$/.test(n) ? `+36 ${groupHu(n)}` : null;
  }
  // shortcut: a foreign number is only length-checked, not grouped; upgrade when a foreign sender appears.
  return /^\+[1-9]\d{7,14}$/.test(d) ? raw.trim().replace(/\s+/g, " ") : null;
}

export function normalizeSenderProfile(input: { name: string; phone: string }): SenderProfile {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A név kötelező" };
  if (name.length > 120) return { ok: false, error: "A név legfeljebb 120 karakter" };
  const raw = input.phone.trim();
  if (!raw) return { ok: true, name, phone: null };
  const phone = normalizePhone(raw);
  return phone ? { ok: true, name, phone } : { ok: false, error: BAD_PHONE };
}
