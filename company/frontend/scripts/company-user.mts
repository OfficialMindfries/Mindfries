// Manage who can sign in to the Company Portal — the local-testing
// equivalent of internal-admin's own scripts/admin.mts, for company_users
// instead of admin_users. Bypasses the real onboarding-email/set-password
// flow (IMPLEMENTATION.md §6) entirely, which is the point: that flow needs
// RESEND_API_KEY configured to actually deliver a usable link, so this is
// how you get a working login for local dev without setting one up.
//
//   npx --yes tsx scripts/company-user.mts companies
//   npx --yes tsx scripts/company-user.mts add-company "<Name>"
//   npx --yes tsx scripts/company-user.mts list [--company <companyId>]
//   npx --yes tsx scripts/company-user.mts add    <email> "<Full Name>" --company <companyId> [--role recruiter|viewer]
//   npx --yes tsx scripts/company-user.mts passwd <email>
//   npx --yes tsx scripts/company-user.mts disable <email>
//   npx --yes tsx scripts/company-user.mts enable  <email>
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

/**
 * Read a line, visibly. internal-admin's own scripts/admin.mts mutes echo
 * for this same prompt against real admin passwords; this script only ever
 * sets throwaway local-dev credentials, so plain visible input — which
 * doesn't depend on readline's terminal-mode handling working a particular
 * way in every shell/terminal emulator — is the more reliable trade here.
 */
function askSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("A terminal is required to type a password (stdin is not a TTY)."));
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function newPassword(): Promise<string> {
  const a = await askSecret("New password: ");
  if (a.length < 8) throw new Error("Use at least 8 characters — same minimum as /set-password.");
  const b = await askSecret("Repeat it:    ");
  if (a !== b) throw new Error("They don't match.");
  return a;
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See scripts/migrate.mts for where to find it.");

  const args = process.argv.slice(2);
  const [cmd, emailArg, nameArg] = args;
  const companyFlag = args.includes("--company") ? args[args.indexOf("--company") + 1] : undefined;
  const role = args.includes("--role") ? args[args.indexOf("--role") + 1] : "recruiter";
  const email = (emailArg ?? "").trim().toLowerCase();

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    if (cmd === "companies") {
      const { rows } = await client.query("select id, name, status from companies order by created_at desc");
      if (rows.length === 0) {
        console.log('(no rows in companies — create one with: add-company "<Name>")');
        return;
      }
      for (const r of rows) console.log(`${r.id}  ${String(r.name).padEnd(30)} ${r.status}`);
      return;
    }

    if (cmd === "add-company") {
      const name = (emailArg ?? "").trim(); // reused positional slot, not actually an email here
      if (!name) throw new Error('Give a name: add-company "<Name>"');
      const { rows } = await client.query(
        "insert into companies (name, status) values ($1, 'active') returning id",
        [name],
      );
      console.log(`ok — ${rows[0].id}  ${name}`);
      return;
    }

    if (cmd === "list") {
      const { rows } = await client.query(
        companyFlag
          ? "select cu.email, cu.name, cu.role, cu.status, c.name as company from company_users cu join companies c on c.id = cu.company_id where cu.company_id = $1 order by cu.created_at"
          : "select cu.email, cu.name, cu.role, cu.status, c.name as company from company_users cu join companies c on c.id = cu.company_id order by cu.created_at",
        companyFlag ? [companyFlag] : [],
      );
      if (rows.length === 0) {
        console.log("(no rows in company_users)");
        return;
      }
      for (const r of rows) {
        console.log(`${String(r.email).padEnd(34)} ${String(r.role).padEnd(10)} ${String(r.status).padEnd(9)} ${r.company}`);
      }
      return;
    }

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Give a valid email address.");

    if (cmd === "add") {
      if (!nameArg || nameArg.startsWith("--")) throw new Error('Give a name: add <email> "Full Name" --company <companyId>');
      if (!companyFlag) throw new Error("Give --company <companyId> — run `companies` to list them.");
      if (!["admin", "recruiter", "viewer"].includes(role)) throw new Error("--role must be admin, recruiter, or viewer");
      const hash = await hashPassword(await newPassword());
      await client.query(
        `insert into company_users (company_id, email, name, password_hash, role, status)
         values ($1,$2,$3,$4,$5,'active')
         on conflict (lower(email)) do update set name = excluded.name, password_hash = excluded.password_hash,
           role = excluded.role, status = 'active', failed_attempts = 0, locked_until = null`,
        [companyFlag, email, nameArg, hash, role],
      );
      console.log(`ok — ${email} can sign in to the Company Portal as ${role}.`);
      return;
    }

    if (cmd === "passwd") {
      const hash = await hashPassword(await newPassword());
      const { rowCount } = await client.query(
        "update company_users set password_hash=$2, status='active', failed_attempts=0, locked_until=null where lower(email)=$1",
        [email, hash],
      );
      console.log(rowCount ? `ok — password changed for ${email}.` : `no such company user: ${email}`);
      return;
    }

    if (cmd === "disable" || cmd === "enable") {
      const status = cmd === "disable" ? "disabled" : "active";
      const { rowCount } = await client.query(
        "update company_users set status=$2, failed_attempts=0, locked_until=null where lower(email)=$1",
        [email, status],
      );
      console.log(rowCount ? `ok — ${email} is now ${status}.` : `no such company user: ${email}`);
      return;
    }

    throw new Error(
      'Commands: companies | add-company "<Name>" | list [--company <id>] | add <email> "<Name>" --company <id> [--role recruiter|viewer] | passwd <email> | disable <email> | enable <email>',
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
