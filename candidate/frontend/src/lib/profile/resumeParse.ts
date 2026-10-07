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
 * What is read out of that text lives in resume-fields.ts.
 */

export class UnparsableFileError extends Error {}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function extractResumeText(file: File): Promise<string> {
  // A browser doesn't always fill in the type (it depends on what the OS
  // knows about the extension), so the name is the fallback.
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (file.type === "application/pdf" || name.endsWith(".pdf")) return extractPdfText(bytes);
  if (file.type === DOCX || name.endsWith(".docx")) return extractDocxText(bytes);
  throw new UnparsableFileError("A .doc file can't be read here — only PDF and DOCX.");
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
