import "server-only";

// The server-side entry point for password hashing.
//
// The implementation is in ./scrypt so that scripts/admin.mts — a plain Node
// script, outside Next — can hash a new password too. Everything inside the
// app imports this module instead, so the `server-only` marker still fails the
// build if a Client Component ever reaches for it.

export { hashPassword, verifyPassword, safeEqual, dummyWork } from "./scrypt";
