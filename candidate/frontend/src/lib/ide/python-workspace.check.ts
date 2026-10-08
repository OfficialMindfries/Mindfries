/**
 * Runs python-workspace.ts against the real Pyodide runtime, in Node:
 *
 *   node src/lib/ide/python-workspace.check.ts [project-dir]
 *
 * With no argument it uses a small built-in project. Given a directory, it
 * loads every file under it as the workspace and runs `python -m unittest`
 * there — which is how a generated assessment codebase is checked for
 * actually working in the candidate's workspace.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadPyodide } from "pyodide";
import { moduleScript, mountScript } from "./python-workspace.ts";

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`${pass ? "ok  " : "FAIL"}  ${label}${pass || !detail ? "" : `\n        ${detail}`}`);
}

function readProject(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (name === "__pycache__" || name === "_BRIEF.md") continue;
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[relative(dir, full).replaceAll("\\", "/")] = readFileSync(full, "utf8");
    }
  };
  walk(dir);
  return files;
}

const pyodide = await loadPyodide();
let out: string[] = [];
pyodide.setStdout({ batched: (text: string) => out.push(text) });
pyodide.setStderr({ batched: (text: string) => out.push(text) });

async function runModule(files: Record<string, string>, cwd: string[], module: string, args: string[]) {
  out = [];
  await pyodide.runPythonAsync(mountScript(files, cwd));
  const code = await pyodide.runPythonAsync(moduleScript(module, args));
  return { code, text: out.join("\n") };
}

const projectDir = process.argv[2];
if (projectDir) {
  const files = readProject(projectDir);
  console.log(`workspace: ${Object.keys(files).length} files from ${projectDir}`);
  const { code, text } = await runModule(files, [], "unittest", process.argv.slice(3));
  console.log(text);
  console.log(`exit code: ${code}`);
  process.exit(code === 0 ? 0 : 1);
}

const project = {
  "shop/__init__.py": "",
  "shop/cart.py": "from shop.prices import PRICES\n\ndef total(items):\n    return sum(PRICES[i] for i in items)\n",
  "shop/prices.py": 'PRICES = {"tea": 3, "cake": 5}\n',
  "data/note.txt": 'quote " and backslash \\ and unicode é\n',
  "tests/__init__.py": "",
  "tests/test_cart.py":
    "import unittest\nfrom shop.cart import total\n\nclass T(unittest.TestCase):\n    def test_total(self):\n        self.assertEqual(total(['tea', 'cake']), 8)\n",
  "node_modules/junk/index.py": "raise SystemExit('should never be copied')\n",
};

let run = await runModule(project, [], "unittest", []);
check("a multi-file project's tests import its modules and pass", run.code === 0 && /Ran 1 test/.test(run.text), run.text);

run = await runModule({ ...project, "shop/prices.py": 'PRICES = {"tea": 3, "cake": 6}\n' }, [], "unittest", []);
check("an edited file takes effect on the next run, and a failing test exits 1", run.code === 1 && /FAILED/.test(run.text), run.text);

run = await runModule(project, [], "unittest", ["discover", "-s", "tests"]);
check("arguments after the module reach it (discover -s tests)", run.code === 0 && /Ran 1 test/.test(run.text), run.text);

run = await runModule(project, ["tests"], "unittest", []);
check("the shell's directory is Python's working directory", /Ran 0 tests|NO TESTS RAN/.test(run.text) || run.code !== 0, run.text);

await pyodide.runPythonAsync(mountScript(project, []));
const note = await pyodide.runPythonAsync('open("data/note.txt", encoding="utf-8").read()');
check("file content survives the copy byte for byte", note === project["data/note.txt"], JSON.stringify(note));

const copied = await pyodide.runPythonAsync('import os; os.path.exists("node_modules")');
check("node_modules is left out", copied === false);

const withoutPrices = Object.fromEntries(Object.entries(project).filter(([path]) => path !== "shop/prices.py"));
run = await runModule(withoutPrices, [], "unittest", []);
check("a deleted file is gone from Python too", run.code === 1 && /ModuleNotFoundError|ImportError/.test(run.text), run.text);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
