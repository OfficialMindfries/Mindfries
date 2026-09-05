/**
 * Maps a file name/extension to the Monaco language id used for syntax
 * highlighting (our "extension support" for now — see candidate/frontend
 * README for the fuller VS Code-extension-host option we deliberately
 * skipped for this first pass).
 */
export function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";

  switch (ext) {
    case "ts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "markdown";
    case "css":
      return "css";
    case "html":
      return "html";
    case "py":
      return "python";
    case "yml":
    case "yaml":
      return "yaml";
    case "sh":
      return "shell";
    case "ipynb":
      return "ipynb";
    default:
      return "plaintext";
  }
}

const DISPLAY_NAMES: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  css: "CSS",
  html: "HTML",
  python: "Python",
  yaml: "YAML",
  shell: "Shell Script",
  plaintext: "Plain Text",
  ipynb: "Jupyter Notebook",
};

/** The label VS Code's status bar shows for a language id, e.g. "TypeScript". */
export function displayLanguageName(languageId: string): string {
  return DISPLAY_NAMES[languageId] ?? languageId;
}
