"use client";

/**
 * Turning a resume file into plain text, and plain text into a few field
 * suggestions — both for real, not simulated.
 *
 * "Auto-fill from resume" only means something if it's reading the file the
 * person actually uploaded. PDF and DOCX are parsed with real libraries
 * (pdfjs-dist, mammoth) client-side; nothing is sent anywhere to do this.
 * A legacy .doc has no practical client-side parser, so that one says so
 * rather than pretending.
 *
 * The suggestions below are regex heuristics over the extracted text, not a
 * language model — there's no key for one, and this doesn't call out to a
 * third party to fake having one. They will sometimes find nothing, or find
 * the wrong line; every field is offered as a suggestion the person reviews
 * and can overwrite, never written in silently.
 */

export class UnparsableFileError extends Error {}

export async function extractResumeText(mimeType: string, dataUrl: string): Promise<string> {
  const bytes = dataUrlToBytes(dataUrl);

  if (mimeType === "application/pdf") return extractPdfText(bytes);
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocxText(bytes);
  }
  throw new UnparsableFileError(
    "Auto-fill can't read a .doc file (only PDF and DOCX) — fill this in yourself, or re-save it as one of those and try again."
  );
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";

  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const lines: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // pdf.js hands back individual text runs, not lines — items on the same
    // page are joined with newlines between runs that look like line breaks
    // (a meaningful vertical gap), so headings don't fuse into the paragraph
    // that follows them.
    let lastY: number | null = null;
    let line = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim());
        line = "";
      }
      line += item.str;
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines.filter(Boolean).join("\n");
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const { value } = await mammoth.extractRawText({ arrayBuffer: bytes.buffer as ArrayBuffer });
  return value;
}

// ── Heuristic field suggestions ─────────────────────────────────────────────

export interface ResumeSuggestions {
  name?: string;
  role?: string;
  location?: string;
  bio?: string;
}

const LOCATION_LINE = /^[A-Z][a-zA-Z.'\s]{1,30},\s*([A-Z][a-zA-Z\s]{1,20}|[A-Z]{2})$/;
const NAME_LINE = /^[A-Z][a-zA-Z.'-]+(\s+[A-Z][a-zA-Z.'-]+){1,3}$/;
const SECTION_HEADERS = /^(summary|profile|about|objective)\b/i;
const NEXT_SECTION_HEADER = /^(experience|work experience|employment|education|skills|projects|certifications|awards)\b/i;

export function suggestFieldsFromText(text: string): ResumeSuggestions {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const suggestions: ResumeSuggestions = {};

  // A resume's first few lines are conventionally name, then title, then
  // location — checked in order, each against its own shape, so a resume
  // that doesn't follow the convention just yields fewer suggestions rather
  // than a wrong one forced into place.
  const head = lines.slice(0, 6);
  const nameLine = head.find((l) => NAME_LINE.test(l) && l.split(/\s+/).length <= 4);
  if (nameLine) suggestions.name = nameLine;

  const roleLine = head.find(
    (l) => l !== nameLine && !LOCATION_LINE.test(l) && l.length < 60 && !/[,@]/.test(l)
  );
  if (roleLine) suggestions.role = roleLine;

  const locationLine = head.find((l) => LOCATION_LINE.test(l));
  if (locationLine) suggestions.location = locationLine;

  // A "Summary"/"Profile"/"About" heading, and everything up to the next
  // section heading or a blank-line-implied break.
  const headerIdx = lines.findIndex((l) => SECTION_HEADERS.test(l));
  if (headerIdx !== -1) {
    const body: string[] = [];
    for (let i = headerIdx + 1; i < lines.length && i < headerIdx + 8; i++) {
      if (NEXT_SECTION_HEADER.test(lines[i])) break;
      body.push(lines[i]);
    }
    const bio = body.join(" ").trim();
    if (bio.length > 20) suggestions.bio = bio.length > 500 ? `${bio.slice(0, 497)}…` : bio;
  }

  return suggestions;
}
