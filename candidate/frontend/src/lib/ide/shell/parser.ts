import type { ShellEnv } from "./types";

/**
 * A word is kept as segments rather than a finished string because quoting
 * decides expansion: `'$HOME'` is literal, `"$HOME"` and `$HOME` expand.
 * Expansion therefore can't happen at tokenize time — it needs the env,
 * which only exists at execution time.
 */
export interface WordSegment {
  text: string;
  expand: boolean;
  /** Quoted segments never glob and never word-split, same as a real shell. */
  quoted: boolean;
}
export type Word = WordSegment[];

export type RedirectOp = ">" | ">>" | "<" | "2>";
export interface Redirect {
  op: RedirectOp;
  target: Word;
}

export interface SimpleCommand {
  words: Word[];
  redirects: Redirect[];
}

export interface Pipeline {
  commands: SimpleCommand[];
}

/** `joiner` is the operator that PRECEDED this pipeline (null for the first). */
export interface ListEntry {
  pipeline: Pipeline;
  joiner: "&&" | "||" | ";" | null;
}

type Token =
  | { type: "word"; word: Word }
  | { type: "op"; value: "|" | "||" | "&&" | ";" | ">" | ">>" | "<" | "2>" };

export class ShellSyntaxError extends Error {}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let current: Word | null = null;
  let plain = "";
  let i = 0;

  const pushSegment = (text: string, expand: boolean, quoted: boolean) => {
    if (!current) current = [];
    current.push({ text, expand, quoted });
  };
  const flushPlain = () => {
    if (plain) {
      pushSegment(plain, true, false);
      plain = "";
    }
  };
  const endWord = () => {
    flushPlain();
    if (current) {
      tokens.push({ type: "word", word: current });
      current = null;
    }
  };
  const pushOp = (value: Extract<Token, { type: "op" }>["value"], width: number) => {
    endWord();
    tokens.push({ type: "op", value });
    i += width;
  };

  while (i < input.length) {
    const ch = input[i];

    if (ch === " " || ch === "\t") {
      endWord();
      i++;
      continue;
    }
    if (ch === "|") {
      pushOp(input[i + 1] === "|" ? "||" : "|", input[i + 1] === "|" ? 2 : 1);
      continue;
    }
    if (ch === "&" && input[i + 1] === "&") {
      pushOp("&&", 2);
      continue;
    }
    if (ch === "&") {
      // Background jobs need real processes; there are none here, so a lone
      // `&` is dropped rather than pretending to fork something.
      endWord();
      i++;
      continue;
    }
    if (ch === ";") {
      pushOp(";", 1);
      continue;
    }
    if (ch === ">") {
      pushOp(input[i + 1] === ">" ? ">>" : ">", input[i + 1] === ">" ? 2 : 1);
      continue;
    }
    if (ch === "<") {
      pushOp("<", 1);
      continue;
    }
    // `2>` is only a redirect at the start of a word — `file2>x` isn't one.
    if (ch === "2" && input[i + 1] === ">" && !current && !plain) {
      pushOp("2>", 2);
      continue;
    }

    if (ch === "'") {
      flushPlain();
      i++;
      let text = "";
      while (i < input.length && input[i] !== "'") {
        text += input[i];
        i++;
      }
      if (i >= input.length) throw new ShellSyntaxError("unexpected EOF while looking for matching `''");
      i++;
      pushSegment(text, false, true);
      continue;
    }

    if (ch === '"') {
      flushPlain();
      i++;
      let text = "";
      while (i < input.length && input[i] !== '"') {
        if (input[i] === "\\" && ['"', "\\", "$"].includes(input[i + 1])) {
          text += input[i + 1];
          i += 2;
          continue;
        }
        text += input[i];
        i++;
      }
      if (i >= input.length) throw new ShellSyntaxError('unexpected EOF while looking for matching `"\'');
      i++;
      pushSegment(text, true, true);
      continue;
    }

    if (ch === "\\" && i + 1 < input.length) {
      flushPlain();
      pushSegment(input[i + 1], false, true);
      i += 2;
      continue;
    }

    plain += ch;
    i++;
  }

  endWord();
  return tokens;
}

/** Tokens -> a list of pipelines joined by `&&` / `||` / `;`. */
export function parse(input: string): ListEntry[] {
  const tokens = tokenize(input);
  const entries: ListEntry[] = [];

  let joiner: ListEntry["joiner"] = null;
  let commands: SimpleCommand[] = [];
  let command: SimpleCommand = { words: [], redirects: [] };

  const endCommand = () => {
    if (command.words.length > 0 || command.redirects.length > 0) commands.push(command);
    command = { words: [], redirects: [] };
  };
  const endPipeline = (nextJoiner: ListEntry["joiner"]) => {
    endCommand();
    if (commands.length > 0) entries.push({ pipeline: { commands }, joiner });
    commands = [];
    joiner = nextJoiner;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "word") {
      command.words.push(token.word);
      continue;
    }

    if (token.value === "|") {
      endCommand();
      continue;
    }
    if (token.value === "&&" || token.value === "||" || token.value === ";") {
      endPipeline(token.value);
      continue;
    }

    // Redirections consume the following word as their target.
    const next = tokens[i + 1];
    if (!next || next.type !== "word") {
      throw new ShellSyntaxError("syntax error near unexpected token `newline'");
    }
    command.redirects.push({ op: token.value, target: next.word });
    i++;
  }

  endPipeline(null);
  return entries;
}

/** `$VAR`, `${VAR}`, `$?` and a leading `~`, applied only to expandable segments. */
function expandVariables(text: string, env: ShellEnv, lastExit: number): string {
  return text.replace(/\$\{(\w+)\}|\$(\w+)|\$\?/g, (match, braced, bare) => {
    if (match === "$?") return String(lastExit);
    return env[braced ?? bare] ?? "";
  });
}

export interface ExpandedWord {
  value: string;
  /** Only unquoted words are candidates for glob matching, same as a real shell. */
  globbable: boolean;
}

export function expandWord(word: Word, env: ShellEnv, lastExit: number): ExpandedWord {
  let value = "";
  let globbable = false;

  for (const segment of word) {
    const text = segment.expand ? expandVariables(segment.text, env, lastExit) : segment.text;
    if (!segment.quoted && /[*?]/.test(segment.text)) globbable = true;
    value += text;
  }

  if (value === "~" || value.startsWith("~/")) {
    value = value.replace("~", env.HOME ?? "/");
  }
  return { value, globbable };
}
