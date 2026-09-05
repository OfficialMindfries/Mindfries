// Copies real, MIT-licensed language/tool logos from the `devicon` package
// (https://github.com/devicons/devicon) into public/file-icons/ so the
// workspace's file explorer can show actual brand logos instead of
// hand-drawn approximations. Runs automatically via "postinstall", and
// again explicitly before `next build` (see package.json) for the same
// reason scripts/copy-monaco.js does.
const fs = require("node:fs");
const path = require("node:path");

const devDir = path.join(__dirname, "..", "node_modules", "devicon", "icons");
const destDir = path.join(__dirname, "..", "public", "file-icons");

// slug (destination filename, referenced from FileTypeIcon.tsx) -> source
// path under devicon/icons/. Preferring the "-original" variant (full
// brand colors); a few brands only ship a flat single-color "-plain".
const ICONS = {
  javascript: "javascript/javascript-original.svg",
  typescript: "typescript/typescript-original.svg",
  python: "python/python-original.svg",
  java: "java/java-original.svg",
  c: "c/c-original.svg",
  cplusplus: "cplusplus/cplusplus-original.svg",
  csharp: "csharp/csharp-original.svg",
  php: "php/php-original.svg",
  ruby: "ruby/ruby-original.svg",
  go: "go/go-original.svg",
  rust: "rust/rust-original.svg",
  swift: "swift/swift-original.svg",
  kotlin: "kotlin/kotlin-original.svg",
  dart: "dart/dart-original.svg",
  r: "r/r-original.svg",
  scala: "scala/scala-original.svg",
  perl: "perl/perl-original.svg",
  lua: "lua/lua-original.svg",
  haskell: "haskell/haskell-original.svg",
  elixir: "elixir/elixir-original.svg",
  clojure: "clojure/clojure-original.svg",
  bash: "bash/bash-original.svg",
  powershell: "powershell/powershell-original.svg",
  mysql: "mysql/mysql-original.svg",
  html5: "html5/html5-original.svg",
  css3: "css3/css3-original.svg",
  sass: "sass/sass-original.svg",
  less: "less/less-plain-wordmark.svg",
  json: "json/json-original.svg",
  yaml: "yaml/yaml-original.svg",
  markdown: "markdown/markdown-original.svg",
  xml: "xml/xml-original.svg",
  docker: "docker/docker-original.svg",
  vuejs: "vuejs/vuejs-original.svg",
  svelte: "svelte/svelte-original.svg",
  graphql: "graphql/graphql-plain.svg",
  git: "git/git-original.svg",
  npm: "npm/npm-original-wordmark.svg",
  terraform: "terraform/terraform-original.svg",
  jupyter: "jupyter/jupyter-original.svg",
};

fs.mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const [slug, rel] of Object.entries(ICONS)) {
  const src = path.join(devDir, rel);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-file-icons] missing source for "${slug}": ${rel}`);
    continue;
  }
  fs.copyFileSync(src, path.join(destDir, `${slug}.svg`));
  copied++;
}

console.log(`[copy-file-icons] copied ${copied}/${Object.keys(ICONS).length} icons to public/file-icons/`);
