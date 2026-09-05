import { FileText } from "lucide-react";

/**
 * Extension (or, for dotfiles/extension-less names, the whole lowercased
 * filename) -> icon slug. Slugs correspond to real, MIT-licensed logo SVGs
 * pulled from the `devicon` package into public/file-icons/ by
 * scripts/copy-file-icons.js — not hand-drawn approximations.
 */
const BY_EXTENSION: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  pyw: "python",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cplusplus",
  cc: "cplusplus",
  cxx: "cplusplus",
  hpp: "cplusplus",
  hh: "cplusplus",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  go: "go",
  rs: "rust",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  dart: "dart",
  r: "r",
  scala: "scala",
  sc: "scala",
  pl: "perl",
  pm: "perl",
  lua: "lua",
  hs: "haskell",
  ex: "elixir",
  exs: "elixir",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ps1: "powershell",
  psm1: "powershell",
  sql: "mysql",
  html: "html5",
  htm: "html5",
  css: "css3",
  scss: "sass",
  sass: "sass",
  less: "less",
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
  xml: "xml",
  vue: "vuejs",
  svelte: "svelte",
  graphql: "graphql",
  gql: "graphql",
  tf: "terraform",
  tfvars: "terraform",
  gitignore: "git",
  gitattributes: "git",
  dockerfile: "docker",
  ipynb: "jupyter",
};

/** Exact filenames that should override the extension-based lookup above. */
const BY_FILENAME: Record<string, string> = {
  "package.json": "npm",
  "package-lock.json": "npm",
  "docker-compose.yml": "docker",
  "docker-compose.yaml": "docker",
};

export function FileTypeIcon({ name, size = 16 }: { name: string; size?: number }) {
  const lowerName = name.toLowerCase();
  const ext = lowerName.split(".").pop() ?? "";
  const slug = BY_FILENAME[lowerName] ?? BY_EXTENSION[ext];

  if (slug) {
    return (
      // A tiny static local SVG doesn't need next/image's optimization pipeline.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/file-icons/${slug}.svg`}
        alt=""
        width={size}
        height={size}
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return <FileText size={size} className="shrink-0 text-[#4A7FA7]" />;
}
