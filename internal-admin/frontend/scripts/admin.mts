// Manage who can sign in to the internal admin.
//
//   npx --yes tsx scripts/admin.mts list
//   npx --yes tsx scripts/admin.mts add    <email> "<Full Name>" [--role viewer]
//   npx --yes tsx scripts/admin.mts passwd <email>
//   npx --yes tsx scripts/admin.mts disable <email>
//   npx --yes tsx scripts/admin.mts enable  <email>
//
// The password is asked for on the terminal with echo off and is never a
// command-line argument — arguments show up in shell history and in the
// process list, where other users on the machine can read them. Only the
// scrypt hash is ever sent to the database.

import { createInterface } from "node:readline";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { hashPassword } from "../lib/auth/scrypt.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(HERE, "..", file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^["'](.*)["']$/, "$1");
      if (v && !process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

/** Read a line with the terminal's echo turned off. */
function askSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("A terminal is required to type a password (stdin is not a TTY)."));
      return;
    }
    const rl = createInterface({ input: stdin, output: process.stdout, terminal: true });
    process.stdout.write(prompt);
    // muted: the readline output stream swallows what would be echoed
    const out = rl as unknown as { output: NodeJS.WriteStream; _writeToOutput: (s: string) => void };
    out._writeToOutput = () => {};
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function newPassword(): Promise<string> {
  const a = await askSecret("New password: ");
  if (a.length < 12) throw new Error("Use at least 12 characters.");
  const b = await askSecret("Repeat it:    ");
  if (a !== b) throw new Error("They don't match.");
  return a;
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See scripts/migrate.mts for where to find it.");

  const [cmd, emailArg, nameArg] = process.argv.slice(2);
  const flags = process.argv.slice(2);
  const role = flags.includes("--role") ? flags[flags.indexOf("--role") + 1] : "admin";
  const email = (emailArg ?? "").trim().toLowerCase();

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    if (cmd === "list") {
      const { rows } = await client.query(
        "select email, name, role, status, failed_attempts, locked_until, last_login_at from admin_users order by created_at",
      );
      const root = (process.env.ROOT_ADMIN_EMAIL ?? "").trim().toLowerCase();
      if (root) console.log(`${root.padEnd(34)} root admin (from the environment, always allowed)`);
      if (rows.length === 0) {
        console.log("(no rows in admin_users)");
        return;
      }
      for (const r of rows) {
        const locked = r.locked_until && Date.parse(r.locked_until) > Date.now() ? " LOCKED" : "";
        const last = r.last_login_at ? new Date(r.last_login_at).toISOString().slice(0, 16).replace("T", " ") : "never";
        console.log(`${String(r.email).padEnd(34)} ${String(r.role).padEnd(7)} ${String(r.status).padEnd(9)} last login ${last}${locked}`);
      }
      return;
    }

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Give a valid email address.");

    if (cmd === "add") {
      if (!nameArg || nameArg.startsWith("--")) throw new Error('Give a name: add <email> "Full Name"');
      if (role !== "admin" && role !== "viewer") throw new Error("--role must be admin or viewer");
      const hash = await hashPassword(await newPassword());
      await client.query(
        `insert into admin_users (email, name, password_hash, role) values ($1,$2,$3,$4)
         on conflict (lower(email)) do update set name = excluded.name, password_hash = excluded.password_hash,
           role = excluded.role, status = 'active', failed_attempts = 0, locked_until = null`,
        [email, nameArg, hash, role],
      );
      console.log(`ok — ${email} can sign in as ${role}.`);
      return;
    }

    if (cmd === "passwd") {
      const hash = await hashPassword(await newPassword());
      const { rowCount } = await client.query(
        "update admin_users set password_hash=$2, failed_attempts=0, locked_until=null where lower(email)=$1",
        [email, hash],
      );
      console.log(rowCount ? `ok — password changed for ${email}.` : `no such admin: ${email}`);
      return;
    }

    if (cmd === "disable" || cmd === "enable") {
      const status = cmd === "disable" ? "disabled" : "active";
      const { rowCount } = await client.query(
        "update admin_users set status=$2, failed_attempts=0, locked_until=null where lower(email)=$1",
        [email, status],
      );
      console.log(rowCount ? `ok — ${email} is now ${status}.` : `no such admin: ${email}`);
      return;
    }

    throw new Error("Commands: list | add <email> \"<Name>\" [--role viewer] | passwd <email> | disable <email> | enable <email>");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
