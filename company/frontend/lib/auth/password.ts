import "server-only";

// The server-side entry point for password hashing. Everything inside the
// app imports this module instead of ./scrypt directly, so the
// `server-only` marker fails the build if a Client Component ever reaches
// for it.

export { hashPassword, verifyPassword, safeEqual, dummyWork } from "./scrypt";
