import { buildPreview, PreviewError } from "../../preview/build-preview";
import { segmentsToPath } from "../../vfs-path";
import { nodeAt, resolve } from "../fs-util";
import { fail, ok, type CommandContext, type CommandResult } from "../types";
import { parseFlags } from "./fs";

/**
 * Builds a project and opens it in the preview sidebar, then leaves it
 * watching: the IDE rebuilds on every edit, so it keeps running the way a
 * dev server would.
 *
 * Shared by `dev` and by `npm run dev`, so both behave identically.
 */
export async function startPreview(ctx: CommandContext, root: string): Promise<CommandResult> {
  if (ctx.isTerminalSink) ctx.io.write(`building ${root || "workspace"}...\r\n`);

  try {
    const build = await buildPreview(ctx.vfs, root);
    ctx.io.openPreview({ html: build.html, title: root || "workspace", root, objectUrls: build.objectUrls });

    const lines = [
      `ready — preview open for ${root || "the workspace"} (entry: ${build.entry})`,
      `watching for changes; edits rebuild it automatically.`,
    ];
    for (const warning of build.warnings) lines.push(`warning: ${warning}`);
    return ok(`${lines.join("\n")}\n`);
  } catch (err) {
    if (err instanceof PreviewError) return fail(`dev: ${err.message}`);
    return fail(`dev: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** `dev [dir]` — build and preview, defaulting to the current directory. */
export async function dev(ctx: CommandContext): Promise<CommandResult> {
  const { operands } = parseFlags(ctx.argv);
  const target = operands[0];
  const segments = target ? resolve(ctx.session, target) : ctx.session.cwd;

  if (target && !nodeAt(ctx.vfs, segments)) {
    return fail(`dev: ${target}: No such file or directory`);
  }
  return startPreview(ctx, segmentsToPath(segments));
}
