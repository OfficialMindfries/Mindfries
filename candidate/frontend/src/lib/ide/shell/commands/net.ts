import { segmentsToPath } from "../../vfs-path";
import { resolve } from "../fs-util";
import { fail, type CommandContext, type CommandResult } from "../types";

/**
 * A browser can only reach servers that opt in with CORS headers — there's no
 * raw socket to fall back to. So this is a real HTTP request with a real
 * limitation, and a blocked request says so plainly instead of pretending
 * the URL was unreachable.
 */
async function fetchUrl(url: string, command: string): Promise<{ body?: string; error?: string; status?: number }> {
  const normalized = /^https?:\/\//.test(url) ? url : `https://${url}`;
  try {
    const response = await fetch(normalized);
    const body = await response.text();
    return { body, status: response.status };
  } catch {
    return {
      error:
        `${command}: (0) Could not reach ${normalized} — the browser blocked it.\n` +
        `${command}: this sandbox can only fetch URLs that send CORS headers (no raw sockets).`,
    };
  }
}

export async function curl(ctx: CommandContext): Promise<CommandResult> {
  const args = ctx.argv.slice(1);
  let output: string | null = null;
  let silent = false;
  let headersOnly = false;
  const urls: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o") {
      output = args[++i] ?? null;
      continue;
    }
    if (args[i] === "-s" || args[i] === "--silent") {
      silent = true;
      continue;
    }
    if (args[i] === "-I" || args[i] === "--head") {
      headersOnly = true;
      continue;
    }
    if (!args[i].startsWith("-")) urls.push(args[i]);
  }

  if (urls.length === 0) return fail("curl: try 'curl <url>'");

  let stdout = "";
  let stderr = "";
  for (const url of urls) {
    const result = await fetchUrl(url, "curl");
    if (result.error) {
      stderr += `${result.error}\n`;
      continue;
    }
    if (headersOnly) {
      stdout += `HTTP ${result.status}\n`;
      continue;
    }
    if (output) {
      const error = ctx.vfs.write(segmentsToPath(resolve(ctx.session, output)), result.body ?? "");
      if (error) stderr += `curl: ${output}: ${error}\n`;
      else if (!silent) stderr += `curl: wrote ${(result.body ?? "").length} bytes to ${output}\n`;
      continue;
    }
    stdout += result.body ?? "";
  }
  return { stdout, stderr, code: stderr ? 1 : 0 };
}

export async function wget(ctx: CommandContext): Promise<CommandResult> {
  const args = ctx.argv.slice(1).filter((a) => !a.startsWith("-"));
  const url = args[0];
  if (!url) return fail("wget: missing URL");

  const result = await fetchUrl(url, "wget");
  if (result.error) return { stderr: `${result.error}\n`, code: 1 };

  const name = args[1] ?? url.split("/").filter(Boolean).pop() ?? "index.html";
  const error = ctx.vfs.write(segmentsToPath(resolve(ctx.session, name)), result.body ?? "");
  if (error) return fail(`wget: ${name}: ${error}`);
  return { stderr: `Saved ${(result.body ?? "").length} bytes to '${name}'\n`, code: 0 };
}
