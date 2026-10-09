/**
 * Checks sync.ts, in Node:
 *
 *   node src/lib/ide/sandbox/sync.check.ts
 */
import { applyPull, forSandbox, planPull, planPush, toManifest } from "./sync.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── push
let push = planPush({ "/a.py": "1", "/b.py": "2" }, { "/a.py": "1", "/b.py": "2" });
check("nothing to push when the sandbox has what was saved", same(push, { writes: [], deletes: [] }));

push = planPush({ "/a.py": "1", "/b.py": "2" }, { "/a.py": "1 edited", "/b.py": "2", "/new.py": "" });
check("an edited file and a new one are written", same(push.writes, ["/a.py", "/new.py"]) && push.deletes.length === 0, JSON.stringify(push));
check("a new empty file is still written", push.writes.includes("/new.py"));

push = planPush({ "/a.py": "1", "/gone.py": "x" }, { "/a.py": "1" });
check("a file deleted in the editor is deleted in the sandbox", same(push, { writes: [], deletes: ["/gone.py"] }));

push = planPush({ "/old.py": "x" }, { "/new.py": "x" });
check("a rename is a delete and a write", same(push, { writes: ["/new.py"], deletes: ["/old.py"] }));

// ── pull: what to fetch
const before = toManifest([{ path: "/a.py", size: 10, modTime: 100 }, { path: "/b.py", size: 5, modTime: 100 }]);
let pull = planPull(before, before);
check("nothing to fetch when the listing hasn't changed", same(pull, { changed: [], removed: [] }));

pull = planPull(before, toManifest([{ path: "/a.py", size: 10, modTime: 200 }, { path: "/c.py", size: 1, modTime: 200 }]));
check("a touched file and a new one are fetched; a missing one is removed", same(pull, { changed: ["/a.py", "/c.py"], removed: ["/b.py"] }), JSON.stringify(pull));

pull = planPull({}, before);
check("the first listing fetches everything", same(pull.changed, ["/a.py", "/b.py"]));

// ── pull: applying it
const clean = { files: { "/a.py": "1", "/b.py": "2" }, saved: { "/a.py": "1", "/b.py": "2" }, known: { "/a.py": "1", "/b.py": "2" } };

let applied = applyPull(clean, { "/a.py": "1 from terminal", "/gen.py": "generated" }, []);
check("a file changed in the terminal updates the editor", applied.files["/a.py"] === "1 from terminal" && applied.saved["/a.py"] === "1 from terminal");
check("a file created in the terminal appears", applied.files["/gen.py"] === "generated" && same(applied.touched, ["/a.py", "/gen.py"]));
check("…and none of that is pushed back", same(planPush(applied.known, applied.saved), { writes: [], deletes: [] }));

applied = applyPull(clean, {}, ["/b.py"]);
check("a file removed in the terminal leaves the editor", !("/b.py" in applied.files) && !("/b.py" in applied.saved) && same(applied.touched, ["/b.py"]));
check("…and isn't deleted a second time", planPush(applied.known, applied.saved).deletes.length === 0);

const typing = { files: { "/a.py": "1 being typed" }, saved: { "/a.py": "1" }, known: { "/a.py": "1" } };
applied = applyPull(typing, { "/a.py": "1 from terminal" }, []);
check("unsaved typing is never overwritten by the sandbox", applied.files["/a.py"] === "1 being typed" && same(applied.kept, ["/a.py"]) && applied.touched.length === 0);
check("…and saving it afterwards writes the candidate's version", planPush(applied.known, { "/a.py": "1 being typed" }).writes.includes("/a.py"));

applied = applyPull(typing, {}, ["/a.py"]);
check("a file deleted on disk while being typed in keeps the typing", applied.files["/a.py"] === "1 being typed" && same(applied.kept, ["/a.py"]));
check("…and saving recreates it", planPush(applied.known, { "/a.py": "1 being typed" }).writes.includes("/a.py"));

// The race that would lose work: the candidate saves, and before that save
// reaches the sandbox a pull reads the file as it was.
const saving = { files: { "/a.py": "v2" }, saved: { "/a.py": "v2" }, known: { "/a.py": "v1" } };
applied = applyPull(saving, { "/a.py": "v1" }, []);
check("a save still on its way isn't undone by reading the old version back", applied.files["/a.py"] === "v2" && applied.saved["/a.py"] === "v2" && applied.touched.length === 0);
check("…and it is still sent", planPush(applied.known, applied.saved).writes.includes("/a.py"));

const created = { files: { "/new.py": "x" }, saved: { "/new.py": "x" }, known: {} };
applied = applyPull(created, {}, []);
check("a file just created in the editor survives a pull that doesn't list it yet", applied.files["/new.py"] === "x");

applied = applyPull(clean, { "/a.py": "1" }, []);
check("a file touched but not changed touches nothing", applied.touched.length === 0);

applied = applyPull(clean, { "/b.py": null, "/blob.bin": null }, []);
check("a file that became binary leaves the editor rather than showing empty", !("/b.py" in applied.files) && !("/blob.bin" in applied.files));
check("…and is never overwritten or deleted by a push", same(planPush(applied.known, applied.saved), { writes: [], deletes: [] }));

// A whole round trip: the editor saves, the listing changes because of that
// save, the pull reads back what was written — and nothing moves.
const afterSave = { files: { "/a.py": "v2" }, saved: { "/a.py": "v2" }, known: { "/a.py": "v2" } };
applied = applyPull(afterSave, { "/a.py": "v2" }, []);
check("reading back the editor's own save changes nothing", applied.touched.length === 0 && applied.kept.length === 0);

check("python becomes python3 in the sandbox", forSandbox("python -m unittest discover -s tests -v") === "python3 -m unittest discover -s tests -v");
check("…but only as the command itself", forSandbox("node --test") === "node --test" && forSandbox("python3 -m pytest") === "python3 -m pytest" && forSandbox("echo python x") === "echo python x");

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
