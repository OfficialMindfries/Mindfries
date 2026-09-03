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

  let build;
  try {
    build = await buildPreview(ctx.vfs, root);
  } catch (err) {
    if (err instanceof PreviewError) return fail(`dev: ${err.message}`);
    return fail(`dev: ${err instanceof Error ? err.message : String(err)}`);
  }

  ctx.io.preview.open({ html: build.html, title: root || "workspace", root, objectUrls: build.objectUrls });

  ctx.io.write(`\r\n  ready — preview open for ${root || "the workspace"}\r\n`);
  ctx.io.write(`  entry: ${build.entry}\r\n`);
  for (const warning of build.warnings) ctx.io.write(`  warning: ${warning}\r\n`);
  ctx.io.write(`\r\n  watching for file changes... (press Ctrl+C to stop)\r\n`);

  // A dev server doesn't hand the prompt back — it holds the terminal,
  // logging rebuilds, until interrupted. Piped or redirected (`dev > log`),
  // there's nobody to press Ctrl+C, so it stays one-shot instead of hanging.
  if (!ctx.isTerminalSink) return ok();

  const unsubscribe = ctx.io.preview.onRebuild((line) => ctx.io.write(`  ${line}\r\n`));

  await new Promise<void>((resolve) => {
    if (ctx.signal.aborted) {
      resolve();
      return;
    }
    ctx.signal.addEventListener("abort", () => resolve(), { once: true });
  });

  unsubscribe();
  ctx.io.preview.stop();
  // Ctrl+C already echoed "^C"; this reports what it stopped.
  return ok("\nstopped watching. the preview stays open but won't update.\n");
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
