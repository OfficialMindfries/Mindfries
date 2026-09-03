import { buildPreview, PreviewError } from "../../preview/build-preview";
import { segmentsToPath } from "../../vfs-path";
import { nodeAt, resolve } from "../fs-util";
import { fail, ok, type CommandContext, type CommandResult } from "../types";
import { parseFlags } from "./fs";

/**
 * `dev` — builds the project in the current directory and opens it in the
 * preview panel.
 *
 * This is the stand-in for `npm run dev`. It isn't Vite (no HMR, no plugins,
 * no production build), but it runs the real source files: JSX through the
 * real TypeScript compiler, imports resolved to the user's own modules and
 * to installed packages.
 */
export async function dev(ctx: CommandContext): Promise<CommandResult> {
  const { operands } = parseFlags(ctx.argv);
  const target = operands[0];
  const segments = target ? resolve(ctx.session, target) : ctx.session.cwd;
  const root = segmentsToPath(segments);

  if (target && !nodeAt(ctx.vfs, segments)) {
    return fail(`dev: ${target}: No such file or directory`);
  }

  if (ctx.isTerminalSink) ctx.io.write(`building ${root || "workspace"}...\r\n`);

  try {
    const build = await buildPreview(ctx.vfs, root);
    ctx.io.openPreview(build.html, root || "workspace");

    const lines = [`ready — preview opened for ${root || "the workspace"} (entry: ${build.entry})`];
    for (const warning of build.warnings) lines.push(`warning: ${warning}`);
    lines.push(`re-run dev after editing to rebuild.`);
    return ok(`${lines.join("\n")}\n`);
  } catch (err) {
    if (err instanceof PreviewError) return fail(`dev: ${err.message}`);
    return fail(`dev: ${err instanceof Error ? err.message : String(err)}`);
  }
}
