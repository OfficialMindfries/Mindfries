import { createHybridFs } from "../../git/hybrid-fs";
import { hasGitData } from "../../git/idb";
import { walk } from "../fs-util";
import { fail, ok, type CommandContext, type CommandResult } from "../types";

/**
 * Real git via isomorphic-git — a genuine object database, real SHA-1
 * commits, a real commit graph. Not a simulation of git's output.
 *
 * The repository always lives at the workspace root: `dir: "/"` with the
 * object store under `/.git` (which the hybrid fs routes to IndexedDB).
 * Network operations (clone/push/pull) need a CORS proxy for most hosts and
 * are deliberately not wired up — see spec.md.
 */

const DIR = "/";

async function loadGit() {
  // Dynamically imported so ~1MB of git doesn't sit in the initial bundle,
  // the same treatment Pyodide and the TypeScript compiler get.
  return import("isomorphic-git");
}

function author(ctx: CommandContext) {
  return {
    name: ctx.session.env.GIT_AUTHOR_NAME ?? ctx.session.env.USER ?? "candidate",
    email: ctx.session.env.GIT_AUTHOR_EMAIL ?? "candidate@mindfries.local",
  };
}

/** Every working-tree file, as repo-relative paths (git never sees `.git` here). */
function workingFiles(ctx: CommandContext): string[] {
  return walk(ctx.vfs, [])
    .filter((node) => node.type === "file")
    .map((node) => node.path);
}

export async function git(ctx: CommandContext): Promise<CommandResult> {
  const [subcommand, ...args] = ctx.argv.slice(1);
  if (!subcommand) {
    return ok(
      "usage: git <init|add|status|commit|log|branch|checkout|rm|config>\n" +
        "clone/push/pull need a network proxy and aren't available in the browser sandbox.\n"
    );
  }

  const isomorphicGit = await loadGit();
  const fs = createHybridFs(ctx.vfs);
  const base = { fs, dir: DIR };

  const requireRepo = async (): Promise<string | null> =>
    (await hasGitData()) ? null : "fatal: not a git repository (or any of the parent directories): .git";

  try {
    switch (subcommand) {
      case "init": {
        await isomorphicGit.init({ ...base, defaultBranch: "main" });
        return ok(`Initialized empty Git repository in /.git/\n`);
      }

      case "add": {
        const repoError = await requireRepo();
        if (repoError) return fail(repoError, 128);
        if (args.length === 0) return fail("Nothing specified, nothing added.");

        // `git add .` (and `-A`) stages the whole working tree.
        const paths =
          args.includes(".") || args.includes("-A") || args.includes("--all")
            ? workingFiles(ctx)
            : args.map((a) => a.replace(/^\.\//, ""));

        let staged = 0;
        let stderr = "";
        for (const filepath of paths) {
          try {
            await isomorphicGit.add({ ...base, filepath });
            staged++;
          } catch (err) {
            stderr += `fatal: pathspec '${filepath}' did not match any files (${describe(err)})\n`;
          }
        }
        return { stdout: "", stderr, code: staged > 0 ? 0 : 1 };
      }

      case "rm": {
        const repoError = await requireRepo();
        if (repoError) return fail(repoError, 128);
        for (const filepath of args) await isomorphicGit.remove({ ...base, filepath });
        return ok();
      }

      case "status": {
        const repoError = await requireRepo();
        if (repoError) return fail(repoError, 128);

        const branch = (await isomorphicGit.currentBranch({ ...base, fullname: false })) ?? "main";
        const matrix = await isomorphicGit.statusMatrix(base);

        const staged: string[] = [];
        const modified: string[] = [];
        const untracked: string[] = [];
        const deleted: string[] = [];

        // Rows are [filepath, HEAD, WORKDIR, STAGE] — see isomorphic-git's docs.
        for (const [filepath, head, workdir, stage] of matrix) {
          if (head === 0 && workdir === 2 && stage === 0) untracked.push(filepath);
          else if (head === 0 && stage > 0) staged.push(`new file:   ${filepath}`);
          else if (head === 1 && workdir === 0) deleted.push(filepath);
          else if (head === 1 && stage === 3) staged.push(`modified:   ${filepath}`);
          else if (head === 1 && workdir === 2 && stage === 2) staged.push(`modified:   ${filepath}`);
          else if (head === 1 && workdir === 2 && stage === 1) modified.push(filepath);
        }

        const lines = [`On branch ${branch}`];
        if (staged.length > 0) {
          lines.push("", "Changes to be committed:", ...staged.map((s) => `        ${s}`));
        }
        if (modified.length > 0) {
          lines.push("", "Changes not staged for commit:", ...modified.map((f) => `        modified:   ${f}`));
        }
        if (deleted.length > 0) {
          lines.push("", "Deleted:", ...deleted.map((f) => `        deleted:    ${f}`));
        }
        if (untracked.length > 0) {
          lines.push("", "Untracked files:", ...untracked.map((f) => `        ${f}`));
        }
        if (staged.length + modified.length + deleted.length + untracked.length === 0) {
          lines.push("", "nothing to commit, working tree clean");
        }
        return ok(`${lines.join("\n")}\n`);
      }

      case "commit": {
        const repoError = await requireRepo();
        if (repoError) return fail(repoError, 128);

        const messageIndex = args.findIndex((a) => a === "-m" || a === "--message");
        const message = messageIndex !== -1 ? args[messageIndex + 1] : undefined;
        if (!message) return fail("fatal: a commit message is required (use -m \"message\")");

        const sha = await isomorphicGit.commit({ ...base, message, author: author(ctx) });
        const branch = (await isomorphicGit.currentBranch({ ...base, fullname: false })) ?? "main";
        return ok(`[${branch} ${sha.slice(0, 7)}] ${message}\n`);
      }

      case "log": {
        const repoError = await requireRepo();
        if (repoError) return fail(repoError, 128);

        const oneline = args.includes("--oneline");
        const commits = await isomorphicGit.log({ ...base, depth: 50 });
        if (commits.length === 0) return ok("");

        const lines = commits.flatMap((entry) => {
          const sha = entry.oid.slice(0, 7);
          const { message, author: who } = entry.commit;
          const title = message.split("\n")[0];
          if (oneline) return [`${sha} ${title}`];
          const when = new Date(who.timestamp * 1000).toString();
          return [`commit ${entry.oid}`, `Author: ${who.name} <${who.email}>`, `Date:   ${when}`, "", `    ${title}`, ""];
        });
        return ok(`${lines.join("\n")}\n`);
      }

      case "branch": {
        const repoError = await requireRepo();
        if (repoError) return fail(repoError, 128);

        if (args.length > 0 && !args[0].startsWith("-")) {
          await isomorphicGit.branch({ ...base, ref: args[0] });
          return ok();
        }
        const current = await isomorphicGit.currentBranch({ ...base, fullname: false });
        const branches = await isomorphicGit.listBranches(base);
        return ok(`${branches.map((b) => (b === current ? `* ${b}` : `  ${b}`)).join("\n")}\n`);
      }

      case "checkout": {
        const repoError = await requireRepo();
        if (repoError) return fail(repoError, 128);
        const ref = args.find((a) => !a.startsWith("-"));
        if (!ref) return fail("fatal: you must specify a branch name");

        if (args.includes("-b")) await isomorphicGit.branch({ ...base, ref });
        await isomorphicGit.checkout({ ...base, ref });
        return ok(`Switched to branch '${ref}'\n`);
      }

      case "config": {
        const [key, value] = args.filter((a) => !a.startsWith("-"));
        if (!key) return fail("usage: git config <key> [value]");
        if (value === undefined) {
          const current = await isomorphicGit.getConfig({ ...base, path: key });
          return ok(current ? `${current}\n` : "");
        }
        await isomorphicGit.setConfig({ ...base, path: key, value });
        return ok();
      }

      case "clone":
      case "push":
      case "pull":
      case "fetch":
        return fail(
          `git ${subcommand}: not available in the browser sandbox.\n` +
            `Talking to a real remote needs a CORS proxy or the backend executor — see spec.md.`,
          128
        );

      default:
        return fail(`git: '${subcommand}' is not a git command. See 'git'.`, 1);
    }
  } catch (err) {
    return fail(`git: ${describe(err)}`, 1);
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
