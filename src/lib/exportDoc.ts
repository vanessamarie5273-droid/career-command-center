import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function toDocx(title: string, text: string) {
  const paras = text.split(/\n/).map((line) => {
    const l = line.trimEnd();
    if (/^[A-Z][A-Z &/]{3,40}$/.test(l.trim())) return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: l.trim() })] });
    if (/^\s*[•\-*]\s+/.test(l)) return new Paragraph({ bullet: { level: 0 }, children: [new TextRun(l.replace(/^\s*[•\-*]\s+/, ""))] });
    return new Paragraph({ children: [new TextRun(l)] });
  });
  const doc = new Document({ creator: "Career Command Center", title, sections: [{ children: paras }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

export async function toPdf(title: string, text: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const size = 10.5, lh = 14, margin = 54, width = 612 - margin * 2;
  let page = pdf.addPage([612, 792]);
  let y = 792 - margin;
  const clean = (s: string) => s.replace(/[^\x20-\x7E -ÿ•–—’‘“”]/g, "").replace(/[•]/g, "-").replace(/[–—]/g, "-").replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  for (const raw of text.split("\n")) {
    const line = clean(raw);
    const isHead = /^[A-Z][A-Z &/]{3,40}$/.test(line.trim());
    const f = isHead ? bold : font;
    const words = line.split(/\s+/);
    let cur = "";
    const lines: string[] = [];
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(t, size) > width) { lines.push(cur); cur = w; } else cur = t; }
    lines.push(cur);
    for (const l of lines) {
      if (y < margin) { page = pdf.addPage([612, 792]); y = 792 - margin; }
      page.drawText(l, { x: margin, y, size, font: f, color: rgb(0.06, 0.09, 0.16) });
      y -= lh;
    }
    if (isHead) y -= 2;
  }
  return Buffer.from(await pdf.save());
}
