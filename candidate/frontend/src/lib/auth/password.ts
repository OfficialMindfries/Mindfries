import "server-only";

// The server-side entry point for password hashing.
//
// The implementation is in ./scrypt so that a plain Node script (outside
// Next, if one is ever needed here — mirrors internal-admin's
// scripts/admin.mts) can hash a password too. Everything inside the app
// imports this module instead, so the `server-only` marker still fails the
// build if a Client Component ever reaches for it.

export { hashPassword, verifyPassword, dummyWork } from "./scrypt";
