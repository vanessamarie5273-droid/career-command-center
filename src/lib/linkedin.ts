// Parser for LinkedIn's official "Connections.csv" data export (Settings → Data privacy → Get a copy of your data).
import JSZip from "jszip";

// Accepts the export exactly as LinkedIn delivers it (a .zip) or the Connections.csv inside it,
// so a phone user never has to unzip first.
export async function connectionsText(buf: Buffer): Promise<string> {
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return buf.toString("utf8"); // not a zip ("PK")
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(buf); } catch { throw new Error("Couldn't open that .zip file. Try downloading the export from LinkedIn again."); }
  const entry = Object.values(zip.files).find((f) => !f.dir && /(^|\/)connections\.csv$/i.test(f.name));
  if (!entry) throw new Error("That .zip has no Connections.csv. Request LinkedIn's export with Connections ticked (or the full archive).");
  return entry.async("string");
}

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

const STOP = /\b(inc|llc|l\.?l\.?c|corp|corporation|co|ltd|limited|plc|gmbh|ag|sa|technologies|technology|software|systems|solutions|the)\b/g;
const tokens = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&/g, " and ").replace(STOP, " ").split(/[^a-z0-9]+/).filter(Boolean);
const norm = (s: string) => tokens(s).join("");
// Words a target company's name can carry beyond what a connection wrote ("Amazon" works at "Amazon Web Services").
const DIVISION = new Set(["cloud", "web", "services", "aws", "ai", "labs", "platform", "platforms", "group", "holdings", "global", "international", "america", "americas", "north", "us", "usa", "inc"]);

/** Matches a connection's employer to a tracked company by whole words, so "VantagePoint" is not "Vanta" and "Axonius" is not "Axon". */
export function matchCompany(name: string | null, companies: { id: string; name: string }[]) {
  if (!name) return null;
  const n = tokens(name);
  if (!n.join("") || n.join("").length < 2) return null;
  const exact = companies.find((c) => norm(c.name) === n.join(""));
  if (exact) return exact;
  return companies.find((c) => {
    const t = tokens(c.name);
    if (!t.length || t.join("").length < 3) return false;
    // The connection names a division of the company: "Workday VNDLY", "Salesforce Japan".
    if (t.length < n.length && t.every((w, i) => n[i] === w)) return true;
    // The connection names the parent and the tracked company only adds a division word: "Google" for "Google Cloud".
    return n.length < t.length && n.every((w, i) => t[i] === w) && n.join("").length >= 4 && t.slice(n.length).every((w) => DIVISION.has(w));
  }) ?? null;
}

// The matcher used by imports before 2026-11-02. It joined words before comparing, so it linked
// "VantagePoint" to Vanta and "e&" to Euna. Kept only to tell an import's link from one she set by hand.
const legacyNorm = (s: string) => s.toLowerCase().replace(/\b(inc|llc|corp|corporation|co|ltd|technologies|technology|software|systems|the)\b|[^a-z0-9]/g, "");
export function legacyMatchCompany(name: string | null, companies: { id: string; name: string }[]) {
  if (!name) return null;
  const n = legacyNorm(name);
  if (!n) return null;
  return companies.find((c) => legacyNorm(c.name) === n) ?? companies.find((c) => legacyNorm(c.name).length >= 4 && (n.startsWith(legacyNorm(c.name)) || legacyNorm(c.name).startsWith(n))) ?? null;
}

/** Same employer, however LinkedIn members spelled it: groups "Coupa" with "Coupa Software". */
export const companyKey = (name: string | null | undefined) => (name ? norm(name) : "");
