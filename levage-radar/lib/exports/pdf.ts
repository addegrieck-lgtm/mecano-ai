import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";

/**
 * Générateur PDF simple (A4) : titres, paragraphes avec retour à la ligne, tableaux clé/valeur, images.
 * Les polices standard PDF (WinAnsi) ne couvrent pas tout l'Unicode : les caractères non pris en charge
 * sont remplacés (jamais supprimés silencieusement sans marque).
 */
const A4 = { w: 595.28, h: 841.89 };
const M = 48;

const REPLACEMENTS: Record<string, string> = {
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  " ": " ",
  " ": " ",
  "≥": ">=",
  "≤": "<=",
  "→": "->",
  "•": "-",
  "œ": "oe",
  "Œ": "OE",
};

export function winAnsi(s: string): string {
  return s
    .replace(/[‘’“”–—…  ≥≤→•œŒ]/g, (c) => REPLACEMENTS[c] ?? "?")
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "?");
}

export class PdfBuilder {
  private doc!: PDFDocument;
  private page!: PDFPage;
  private font!: PDFFont;
  private bold!: PDFFont;
  private y = 0;
  private pageNo = 0;

  private constructor(
    private readonly title: string,
    private readonly footer: string,
  ) {}

  static async create(title: string, footer: string) {
    const b = new PdfBuilder(title, footer);
    b.doc = await PDFDocument.create();
    b.doc.setTitle(winAnsi(title));
    b.doc.setProducer("LEVAGE RADAR");
    b.font = await b.doc.embedFont(StandardFonts.Helvetica);
    b.bold = await b.doc.embedFont(StandardFonts.HelveticaBold);
    b.newPage();
    return b;
  }

  private newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pageNo++;
    this.y = A4.h - M;
    this.page.drawText(winAnsi(this.footer), { x: M, y: 24, size: 7.5, font: this.font, color: rgb(0.4, 0.4, 0.4), maxWidth: A4.w - 2 * M - 40 });
    this.page.drawText(`${this.pageNo}`, { x: A4.w - M, y: 24, size: 8, font: this.font, color: rgb(0.4, 0.4, 0.4) });
  }

  private ensure(h: number) {
    if (this.y - h < M) this.newPage();
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of winAnsi(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
        else {
          if (line) out.push(line);
          // Mot plus long que la ligne : découpe forcée
          let w = word;
          while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
            let i = w.length;
            while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
            out.push(w.slice(0, i));
            w = w.slice(i);
          }
          line = w;
        }
      }
      out.push(line);
    }
    return out;
  }

  banner(text: string) {
    const lines = this.wrap(text, this.bold, 9, A4.w - 2 * M - 16);
    const h = lines.length * 12 + 12;
    this.ensure(h + 6);
    this.page.drawRectangle({ x: M, y: this.y - h, width: A4.w - 2 * M, height: h, color: rgb(1, 0.95, 0.85), borderColor: rgb(0.85, 0.55, 0.1), borderWidth: 1 });
    let y = this.y - 16;
    for (const l of lines) {
      this.page.drawText(l, { x: M + 8, y, size: 9, font: this.bold, color: rgb(0.45, 0.25, 0) });
      y -= 12;
    }
    this.y -= h + 10;
  }

  heading(text: string, level: 1 | 2 | 3 = 2) {
    const size = level === 1 ? 17 : level === 2 ? 13 : 11;
    const lines = this.wrap(text, this.bold, size, A4.w - 2 * M);
    this.ensure(lines.length * (size + 4) + 10);
    this.y -= level === 1 ? 0 : 6;
    for (const l of lines) {
      this.page.drawText(l, { x: M, y: this.y - size, size, font: this.bold, color: rgb(0.08, 0.15, 0.3) });
      this.y -= size + 4;
    }
    if (level <= 2) {
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.6, color: rgb(0.75, 0.78, 0.85) });
      this.y -= 6;
    }
  }

  paragraph(text: string, opts: { size?: number; color?: [number, number, number]; bold?: boolean } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.font;
    for (const l of this.wrap(text, font, size, A4.w - 2 * M)) {
      this.ensure(size + 4);
      this.page.drawText(l, { x: M, y: this.y - size, size, font, color: rgb(...(opts.color ?? [0.1, 0.1, 0.1])) });
      this.y -= size + 3.5;
    }
    this.y -= 4;
  }

  keyValues(rows: [string, string | null | undefined][], missing = "Non renseigné") {
    const kw = 160;
    for (const [k, v] of rows) {
      const value = v === null || v === undefined || v === "" ? missing : v;
      const lines = this.wrap(value, this.font, 9, A4.w - 2 * M - kw);
      const h = Math.max(1, lines.length) * 12.5;
      this.ensure(h + 2);
      this.page.drawText(winAnsi(k), { x: M, y: this.y - 9, size: 8.5, font: this.bold, color: rgb(0.3, 0.33, 0.4), maxWidth: kw - 8 });
      let y = this.y - 9;
      for (const l of lines) {
        this.page.drawText(l, { x: M + kw, y, size: 9, font: this.font, color: value === missing ? rgb(0.7, 0.35, 0) : rgb(0.1, 0.1, 0.1) });
        y -= 12.5;
      }
      this.y -= h;
    }
    this.y -= 6;
  }

  bullets(items: string[]) {
    for (const it of items) {
      const lines = this.wrap(it, this.font, 9.5, A4.w - 2 * M - 12);
      lines.forEach((l, i) => {
        this.ensure(13);
        if (i === 0) this.page.drawText("-", { x: M, y: this.y - 9.5, size: 9.5, font: this.font });
        this.page.drawText(l, { x: M + 12, y: this.y - 9.5, size: 9.5, font: this.font });
        this.y -= 13;
      });
    }
    this.y -= 4;
  }

  async image(bytes: Uint8Array, mime: string, caption?: string) {
    let img: PDFImage;
    try {
      img = mime === "image/png" ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
    } catch {
      this.paragraph(`[Image non intégrable au PDF (${mime})${caption ? ` : ${caption}` : ""}]`, { color: [0.6, 0.3, 0] });
      return;
    }
    const maxW = (A4.w - 2 * M) / 2;
    const scale = Math.min(maxW / img.width, 220 / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    this.ensure(h + 20);
    this.page.drawImage(img, { x: M, y: this.y - h, width: w, height: h });
    this.y -= h + 4;
    if (caption) this.paragraph(caption, { size: 8, color: [0.35, 0.35, 0.35] });
  }

  async bytes(): Promise<Uint8Array> {
    return this.doc.save();
  }
}
