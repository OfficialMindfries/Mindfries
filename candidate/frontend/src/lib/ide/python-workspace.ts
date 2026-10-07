/**
 * Makes the workspace a real directory as far as Python is concerned.
 *
 * Pyodide has its own in-memory filesystem, separate from the workspace VFS
 * the Explorer and editor use. Until the two are connected, `python app.py`
 * can run that one file's text and nothing else: `from gateway.models import
 * …` fails, `open("data.json")` fails, and a test suite can't find the code
 * it tests. These functions build the Python that connects them — the
 * workspace's files are written into Pyodide's filesystem before each run,
 * with the shell's current directory as Python's.
 *
 * It's a one-way copy, workspace → Python, redone on every run so edits
 * always take effect. Files a script writes land in Python's filesystem and
 * are gone on the next run; they don't appear in the Explorer.
 *
 * No DOM and no Pyodide import here: these return Python source as strings,
 * so the logic can be exercised in Node against the real runtime (see
 * python-workspace.check.ts).
 */

/** Where the workspace lives inside Pyodide's filesystem. */
export const WORKSPACE_ROOT = "/workspace";

// Installed packages are the candidate's tooling, not Python source, and
// copying them on every run would only cost time.
const skipped = (path: string) => /(^|\/)(node_modules|\.git)\//.test(path);

/** A JS string as a Python string literal. JSON's escapes are all valid Python. */
const py = (value: string) => JSON.stringify(value);

/**
 * Python that mirrors `files` into WORKSPACE_ROOT, makes `cwd` the working
 * directory, puts it first on sys.path, and forgets any workspace module
 * imported by an earlier run — without that last step Python would keep
 * serving the old version of a file the candidate has since edited.
 */
export function mountScript(files: Record<string, string>, cwd: string[]): string {
  const kept = Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => !skipped(path))
      .map(([path, content]) => [path.replace(/^\/+/, ""), content]),
  );
  return `
import importlib as _il, json as _json, os as _os, shutil as _shutil, sys as _sys
_root = ${py(WORKSPACE_ROOT)}
_shutil.rmtree(_root, ignore_errors=True)
_os.makedirs(_root, exist_ok=True)
for _path, _content in _json.loads(${py(JSON.stringify(kept))}).items():
    _full = _os.path.join(_root, _path)
    _os.makedirs(_os.path.dirname(_full), exist_ok=True)
    with open(_full, "w", encoding="utf-8", newline="") as _f:
        _f.write(_content)
_cwd = _os.path.join(_root, *_json.loads(${py(JSON.stringify(cwd))}))
_os.makedirs(_cwd, exist_ok=True)
_os.chdir(_cwd)
_sys.path[:] = [_p for _p in _sys.path if _p != "" and not _p.startswith(_root)]
_sys.path.insert(0, _cwd)
for _name, _mod in list(_sys.modules.items()):
    if (getattr(_mod, "__file__", None) or "").startswith(_root + "/"):
        del _sys.modules[_name]
_il.invalidate_caches()
`;
}

/**
 * Python that runs `python -m <module> <args…>` and leaves the exit status in
 * `_mf_exit_code`. A module run this way ends by raising SystemExit (unittest
 * does, to report pass/fail); that's its exit code, not a crash, so it's
 * caught and recorded rather than shown as a traceback.
 */
export function moduleScript(module: string, args: string[]): string {
  return `
import json as _json, runpy as _runpy, sys as _sys
_sys.argv = [${py(module)}] + _json.loads(${py(JSON.stringify(args))})
_mf_exit_code = 0
try:
    _runpy.run_module(${py(module)}, run_name="__main__", alter_sys=True)
except SystemExit as _exit:
    _code = _exit.code
    if _code is None:
        _mf_exit_code = 0
    elif isinstance(_code, int):
        _mf_exit_code = int(_code)
    else:
        print(_code, file=_sys.stderr)
        _mf_exit_code = 1
_sys.stdout.flush()
_sys.stderr.flush()
_mf_exit_code
`;
}
