import type { CommandFn } from "./types";
import * as builtins from "./commands/builtins";
import * as fs from "./commands/fs";
import * as gitCommands from "./commands/git";
import * as net from "./commands/net";
import * as pkg from "./commands/pkg";
import * as run from "./commands/run";
import * as text from "./commands/text";

/**
 * Every command the shell knows, by the name you type. Aliases that map to
 * the same implementation (node/js, python/python3) are separate keys so
 * Tab-completion and `which` see them the way a real $PATH would.
 */
const COMMANDS: Record<string, CommandFn> = {
  // Filesystem
  ls: fs.ls,
  cd: fs.cd,
  pwd: fs.pwd,
  cat: fs.cat,
  touch: fs.touch,
  mkdir: fs.mkdir,
  rm: fs.rm,
  mv: fs.mv,
  cp: fs.cp,
  find: fs.find,
  tree: fs.tree,

  // Text processing
  echo: text.echo,
  grep: text.grep,
  sed: text.sed,
  head: text.head,
  tail: text.tail,
  wc: text.wc,
  sort: text.sort,
  uniq: text.uniq,
  cut: text.cut,
  tr: text.tr,
  diff: text.diff,

  // Running code
  node: run.node,
  js: run.node,
  "ts-node": run.node,
  tsx: run.node,
  python: run.python,
  python3: run.python,

  // Packages
  pip: pkg.pip,
  pip3: pkg.pip,
  npm: pkg.npm,
  npx: pkg.npx,

  // Version control
  git: gitCommands.git,

  // Network
  curl: net.curl,
  wget: net.wget,

  // Shell builtins
  env: builtins.env,
  export: builtins.exportVar,
  unset: builtins.unset,
  alias: builtins.alias,
  unalias: builtins.unalias,
  which: builtins.which,
  history: builtins.history,
  clear: builtins.clear,
  whoami: builtins.whoami,
  date: builtins.date,
  uname: builtins.uname,
  help: builtins.help,
  write: builtins.write,
};

export function lookupCommand(name: string): CommandFn | undefined {
  return COMMANDS[name];
}

export function hasCommand(name: string): boolean {
  return name in COMMANDS;
}

/** Sorted command names — used by Tab-completion and `help`. */
export function commandNames(): string[] {
  return Object.keys(COMMANDS).sort();
}
