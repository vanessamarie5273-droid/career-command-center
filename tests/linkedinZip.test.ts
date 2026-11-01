import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { connectionsText, parseConnections } from "@/lib/linkedin";

const CSV = "Notes:\n\"When exporting your connection data...\"\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nAna,Ruiz,https://www.linkedin.com/in/ana,,Databricks,Sales Director,01 Oct 2026\n";

describe("LinkedIn export upload", () => {
  it("reads a plain Connections.csv", async () => {
    expect(parseConnections(await connectionsText(Buffer.from(CSV)))).toHaveLength(1);
  });

  it("reads Connections.csv straight out of LinkedIn's .zip", async () => {
    const zip = new JSZip();
    zip.file("Profile.csv", "First Name,Last Name\nVanessa,Morales\n");
    zip.file("Basic_LinkedInDataExport_11-01-2026/Connections.csv", CSV);
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const rows = parseConnections(await connectionsText(buf));
    expect(rows.map((r) => r.company)).toEqual(["Databricks"]);
  });

  it("explains when the .zip has no Connections.csv", async () => {
    const zip = new JSZip();
    zip.file("Profile.csv", "x");
    await expect(connectionsText(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow(/no Connections\.csv/);
  });
});
