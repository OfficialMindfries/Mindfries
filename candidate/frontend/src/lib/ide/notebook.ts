/**
 * Minimal Jupyter notebook (nbformat v4) read/write support — enough to
 * edit and run .ipynb files in the workspace. Deliberately scoped down:
 * code + markdown cells with plain text stdout/stderr output only (no
 * rich display data — images/plots/HTML output aren't captured).
 */

export type CellType = "code" | "markdown";

export interface NotebookCell {
  /** Local-only id for React keys / selection — not part of nbformat. */
  id: string;
  type: CellType;
  source: string;
  outputs: string[];
  status: "idle" | "running" | "error";
}

export interface NotebookDoc {
  cells: NotebookCell[];
  kernelLanguage: "python" | "javascript";
}

let nextCellId = 1;
function makeId(): string {
  nextCellId += 1;
  return `cell-${nextCellId}`;
}

export function emptyNotebook(): NotebookDoc {
  return {
    kernelLanguage: "python",
    cells: [{ id: makeId(), type: "code", source: "", outputs: [], status: "idle" }],
  };
}

export function emptyNotebookJson(): string {
  return serializeNotebook(emptyNotebook());
}

function joinSource(source: unknown): string {
  if (Array.isArray(source)) return source.join("");
  if (typeof source === "string") return source;
  return "";
}

/** Best-effort text extraction from nbformat's `outputs` array (stream/error only — no rich display). */
function extractOutputs(outputs: unknown): string[] {
  if (!Array.isArray(outputs)) return [];
  const lines: string[] = [];
  for (const out of outputs) {
    if (!out || typeof out !== "object") continue;
    const o = out as Record<string, unknown>;
    if (o.output_type === "stream" || o.output_type === "error") {
      const text = o.text ?? o.traceback;
      if (Array.isArray(text)) lines.push(text.join(""));
      else if (typeof text === "string") lines.push(text);
    }
  }
  return lines;
}

export function parseNotebook(json: string): NotebookDoc {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const rawCells = Array.isArray(raw.cells) ? raw.cells : [];
    const cells: NotebookCell[] = rawCells.map((c) => {
      const cell = c as Record<string, unknown>;
      const type: CellType = cell.cell_type === "markdown" ? "markdown" : "code";
      return {
        id: makeId(),
        type,
        source: joinSource(cell.source),
        outputs: extractOutputs(cell.outputs),
        status: "idle",
      };
    });
    const metadata = raw.metadata as Record<string, unknown> | undefined;
    const kernelspec = metadata?.kernelspec as Record<string, unknown> | undefined;
    const kernelLanguage = kernelspec?.language === "javascript" ? "javascript" : "python";

    return {
      cells: cells.length > 0 ? cells : emptyNotebook().cells,
      kernelLanguage,
    };
  } catch {
    return emptyNotebook();
  }
}

export function serializeNotebook(doc: NotebookDoc): string {
  const nb = {
    cells: doc.cells.map((cell) => ({
      cell_type: cell.type,
      metadata: {},
      source: cell.source.split(/(?<=\n)/), // nbformat convention: array of lines, each keeping its trailing \n
      ...(cell.type === "code"
        ? {
            execution_count: null,
            outputs:
              cell.outputs.length > 0
                ? [{ output_type: "stream", name: "stdout", text: cell.outputs.join("").split(/(?<=\n)/) }]
                : [],
          }
        : {}),
    })),
    metadata: {
      kernelspec: {
        display_name: doc.kernelLanguage === "python" ? "Python 3" : "JavaScript",
        language: doc.kernelLanguage,
        name: doc.kernelLanguage === "python" ? "python3" : "javascript",
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
  return JSON.stringify(nb, null, 1);
}
