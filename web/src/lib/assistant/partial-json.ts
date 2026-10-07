// Reads fields out of an incomplete JSON text (streamed model output). Pure.

/** Index just after the `"key":` of a TOP-LEVEL property, scanning with string/depth awareness. */
function valueStart(buf: string, key: string): number {
  let depth = 0;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < buf.length && buf[j] !== '"') {
        if (buf[j] === "\\") { s += buf.slice(j, j + 2); j += 2; } else s += buf[j++];
      }
      if (j >= buf.length) return -1;
      i = j;
      if (depth === 1 && s === key) {
        const m = /^\s*:\s*/.exec(buf.slice(j + 1));
        if (m) return j + 1 + m[0].length;
        if (/^\s*:?\s*$/.test(buf.slice(j + 1))) return -1;
      }
    }
  }
  return -1;
}

const ESC: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };

export function partialStringField(buf: string, key: string): string | null {
  const st = valueStart(buf, key);
  if (st < 0 || buf[st] !== '"') return null;
  let out = "";
  for (let i = st + 1; i < buf.length; i++) {
    const c = buf[i];
    if (c === '"') break;
    if (c !== "\\") { out += c; continue; }
    const n = buf[i + 1];
    if (n === undefined) break;
    if (n === "u") {
      const h = buf.slice(i + 2, i + 6);
      if (h.length < 4 || !/^[0-9a-fA-F]{4}$/.test(h)) break;
      out += String.fromCharCode(parseInt(h, 16));
      i += 5;
    } else { out += ESC[n] ?? n; i++; }
  }
  return out;
}

export function completeIntArrayField(buf: string, key: string): number[] | null {
  const st = valueStart(buf, key);
  if (st < 0 || buf[st] !== "[") return null;
  const end = buf.indexOf("]", st);
  if (end < 0) return null;
  try {
    const a = JSON.parse(buf.slice(st, end + 1));
    return Array.isArray(a) && a.every(Number.isInteger) ? a : null;
  } catch {
    return null;
  }
}
