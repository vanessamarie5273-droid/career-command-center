// Parser for LinkedIn's official "Connections.csv" data export (Settings → Data privacy → Get a copy of your data).

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export type ConnectionRow = { firstName: string; lastName: string; url: string | null; email: string | null; company: string | null; position: string | null; connectedOn: Date | null };

export function parseConnections(text: string): ConnectionRow[] {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const h = rows.findIndex((r) => r.map((c) => c.trim().toLowerCase()).includes("first name"));
  if (h < 0) throw new Error("This does not look like LinkedIn's Connections.csv (no 'First Name' header found)");
  const head = rows[h].map((c) => c.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n);
  const [fi, li, ui, ei, ci, pi, di] = ["first name", "last name", "url", "email address", "company", "position", "connected on"].map(col);
  return rows.slice(h + 1).map((r) => ({
    firstName: (r[fi] ?? "").trim(), lastName: (r[li] ?? "").trim(), url: (r[ui] ?? "").trim() || null, email: ei >= 0 ? (r[ei] ?? "").trim() || null : null,
    company: (r[ci] ?? "").trim() || null, position: (r[pi] ?? "").trim() || null,
    connectedOn: di >= 0 && r[di] && !isNaN(Date.parse(r[di])) ? new Date(r[di]) : null,
  })).filter((c) => c.firstName);
}

const norm = (s: string) => s.toLowerCase().replace(/\b(inc|llc|corp|corporation|co|ltd|technologies|technology|software|systems|the)\b|[^a-z0-9]/g, "");
export function matchCompany(name: string | null, companies: { id: string; name: string }[]) {
  if (!name) return null;
  const n = norm(name);
  if (!n) return null;
  return companies.find((c) => norm(c.name) === n) ?? companies.find((c) => norm(c.name).length >= 4 && (n.startsWith(norm(c.name)) || norm(c.name).startsWith(n))) ?? null;
}
