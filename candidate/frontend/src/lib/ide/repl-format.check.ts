import { formatValue, formatLogArguments, formatError } from "./repl-format.ts";

let failures = 0;
function check(label: string, actual: string, expected: string) {
  const pass = actual === expected;
  if (!pass) failures++;
  console.log(`${pass ? "ok  " : "FAIL"}  ${label}\n        got:      ${actual}${pass ? "" : `\n        expected: ${expected}`}`);
}

check("number", formatValue(1024), "1024");
check("negative zero", formatValue(-0), "-0");
check("string is quoted as a result", formatValue("hi"), "'hi'");
check("string with a quote", formatValue("it's"), "'it\\'s'");
check("undefined", formatValue(undefined), "undefined");
check("null", formatValue(null), "null");
check("bigint", formatValue(10n), "10n");
check("array", formatValue([1, 2, 3]), "[ 1, 2, 3 ]");
check("empty array", formatValue([]), "[]");
check("nested strings stay quoted", formatValue(["a"]), "[ 'a' ]");
check("object", formatValue({ a: 1, b: "x" }), "{ a: 1, b: 'x' }");
check("empty object", formatValue({}), "{}");
check("odd key is quoted", formatValue({ "a-b": 1 }), "{ 'a-b': 1 }");
check("class instance keeps its name", formatValue(new (class Point { x = 1 })()), "Point { x: 1 }");
check("function", formatValue(function greet() {}), "[Function: greet]");
check("anonymous function", formatValue(() => {}), "[Function (anonymous)]");
check("class", formatValue(class Widget {}), "[class Widget]");
check("map", formatValue(new Map([["a", 1]])), "Map(1) { 'a' => 1 }");
check("set", formatValue(new Set([1, 2])), "Set(2) { 1, 2 }");
check("regexp", formatValue(/ab+c/gi), "/ab+c/gi");
check("date", formatValue(new Date(0)), "1970-01-01T00:00:00.000Z");
check("depth limit", formatValue({ a: { b: { c: { d: 1 } } } }), "{ a: { b: { c: [Object] } } }");

const circular: Record<string, unknown> = { name: "loop" };
circular.self = circular;
check("circular", formatValue(circular), "{ name: 'loop', self: [Circular *1] }");

const big = Array.from({ length: 120 }, (_, i) => i);
check("item cap", formatValue(big).endsWith("… 20 more items ]") ? "capped" : formatValue(big), "capped");

check("log args: strings are not quoted", formatLogArguments(["a", 1]), "a 1");
check("log args: nested string still quoted", formatLogArguments([["a"]]), "[ 'a' ]");

const err = new TypeError("nope");
err.stack = "TypeError: nope\n    at <anonymous>";
check("error uses its stack", formatError(err), "TypeError: nope\n    at <anonymous>");
check("thrown non-error", formatError("plain"), "Uncaught 'plain'");

// Cross-realm: an array from another realm has a different Array.prototype,
// so `instanceof Array` is false. This is exactly what the injected script
// produces, and the reason the formatter avoids `instanceof` throughout.
const foreign = Object.create(null) as { toString?: unknown };
check("null-prototype object", formatValue(foreign), "{}");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
