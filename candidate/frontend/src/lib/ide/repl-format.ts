/**
 * Value formatting for the Debug Console, modeled on Node's `util.inspect`
 * (which is what VS Code's Debug Console and the `node` REPL both show).
 *
 * Deliberately has no DOM or React imports so it can be tested under plain
 * Node — the same rule the shell engine follows, and for the same reason.
 *
 * Cross-realm safe: nothing here uses `instanceof`, because a value produced
 * by an injected `<script>` can come from a different realm than this module,
 * where `instanceof Array` is false for a genuine array. `Array.isArray` and
 * `Object.prototype.toString` both work across realms; `instanceof` does not.
 */

const MAX_DEPTH = 2;
const MAX_ITEMS = 100;
const MAX_STRING = 400;

function tag(value: object): string {
  return Object.prototype.toString.call(value).slice(8, -1);
}

function quote(text: string): string {
  const clipped =
    text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}… ${text.length - MAX_STRING} more characters` : text;
  const escaped = clipped.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
  return `'${escaped}'`;
}

function describeFunction(value: object): string {
  const source = Function.prototype.toString.call(value);
  const kind = /^\s*class[\s{]/.test(source) ? "class" : "Function";
  const name = (value as { name?: string }).name;
  if (kind === "class") return name ? `[class ${name}]` : "[class (anonymous)]";
  return name ? `[Function: ${name}]` : "[Function (anonymous)]";
}

/**
 * Errors are shown by stack, the way an uncaught error appears in a terminal.
 * Detected by shape rather than `instanceof Error` for the cross-realm reason
 * above — a thrown error from the injected script is a foreign Error.
 */
export function isErrorLike(value: unknown): value is Error {
  return (
    typeof value === "object" &&
    value !== null &&
    (tag(value) === "Error" || (typeof (value as Error).stack === "string" && typeof (value as Error).message === "string"))
  );
}

export function formatError(value: unknown): string {
  if (isErrorLike(value)) {
    const stack = value.stack;
    if (typeof stack === "string" && stack.length > 0) return stack;
    return `${value.name ?? "Error"}: ${value.message}`;
  }
  // `throw 'a string'` is legal, and Node prints it as `Uncaught 'a string'`.
  return `Uncaught ${formatValue(value)}`;
}

function entriesOf(value: object, seen: Set<object>, depth: number): string[] {
  const keys = Object.keys(value).slice(0, MAX_ITEMS);
  const parts = keys.map((key) => {
    const printable = /^[A-Za-z_$][\w$]*$/.test(key) ? key : quote(key);
    return `${printable}: ${format(Reflect.get(value, key), seen, depth + 1)}`;
  });
  const total = Object.keys(value).length;
  if (total > MAX_ITEMS) parts.push(`… ${total - MAX_ITEMS} more items`);
  return parts;
}

function format(value: unknown, seen: Set<object>, depth: number): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  switch (typeof value) {
    case "string":
      // Quoted when nested or echoed as a result, exactly like Node — it's how
      // you tell the string "1" from the number 1.
      return quote(value);
    case "number":
      return Object.is(value, -0) ? "-0" : String(value);
    case "boolean":
    case "symbol":
      return String(value);
    case "bigint":
      return `${value}n`;
    case "function":
      return describeFunction(value as object);
  }

  const object = value as object;
  if (seen.has(object)) return "[Circular *1]";
  if (depth > MAX_DEPTH) return Array.isArray(object) ? "[Array]" : "[Object]";

  seen.add(object);
  try {
    const kind = tag(object);

    if (isErrorLike(object)) return (object as Error).stack ?? `${(object as Error).name}: ${(object as Error).message}`;
    if (kind === "Date") return new Date(Number(object)).toISOString();
    if (kind === "RegExp") return String(object);

    if (Array.isArray(object)) {
      const items = object.slice(0, MAX_ITEMS).map((item) => format(item, seen, depth + 1));
      if (object.length > MAX_ITEMS) items.push(`… ${object.length - MAX_ITEMS} more items`);
      return items.length === 0 ? "[]" : `[ ${items.join(", ")} ]`;
    }

    if (kind === "Map") {
      const map = object as Map<unknown, unknown>;
      const items = [...map.entries()]
        .slice(0, MAX_ITEMS)
        .map(([k, v]) => `${format(k, seen, depth + 1)} => ${format(v, seen, depth + 1)}`);
      return `Map(${map.size}) {${items.length ? ` ${items.join(", ")} ` : ""}}`;
    }

    if (kind === "Set") {
      const set = object as Set<unknown>;
      const items = [...set.values()].slice(0, MAX_ITEMS).map((v) => format(v, seen, depth + 1));
      return `Set(${set.size}) {${items.length ? ` ${items.join(", ")} ` : ""}}`;
    }

    if (kind === "Promise") return "Promise { <pending or settled> }";

    const parts = entriesOf(object, seen, depth);
    const prefix = object.constructor && object.constructor.name && object.constructor.name !== "Object"
      ? `${object.constructor.name} `
      : "";
    return parts.length === 0 ? `${prefix}{}` : `${prefix}{ ${parts.join(", ")} }`;
  } finally {
    seen.delete(object);
  }
}

/** Node-style inspection of a single value. */
export function formatValue(value: unknown): string {
  return format(value, new Set(), 0);
}

/**
 * `console.log('a', 1)` prints `a 1` — top-level strings are NOT quoted when
 * logged, only when echoed as a result. That difference is Node's, and it
 * matters: it's how the console distinguishes what you printed from what an
 * expression evaluated to.
 */
export function formatLogArguments(args: unknown[]): string {
  return args.map((arg) => (typeof arg === "string" ? arg : formatValue(arg))).join(" ");
}
