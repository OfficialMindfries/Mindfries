/**
 * Checks environment-checks.ts, in Node:
 *
 *   node src/lib/environment-checks.check.ts
 */
import { browserCapabilities, mediaErrorMessage, summarize } from "./environment-checks.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const store = new Map<string, string>();
const good = {
  WebAssembly: { instantiate() {} },
  Worker: function Worker() {},
  indexedDB: {},
  localStorage: { setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  navigator: { mediaDevices: { getUserMedia() {} } },
  WebSocket: function WebSocket() {},
  document: { fullscreenEnabled: true },
  screen: { width: 1440 },
};

let s = summarize(browserCapabilities(good));
check("a browser with everything passes", s.passed && s.missing.length === 0 && s.warnings.length === 0);

s = summarize(browserCapabilities({ ...good, screen: { width: 800 } }));
check("a small screen is a warning, not a failure", s.passed && s.warnings.length === 1, s.warnings.join(", "));

s = summarize(browserCapabilities({ ...good, WebAssembly: undefined }));
check("no WebAssembly fails, and is named", !s.passed && s.missing.join() === "WebAssembly", s.missing.join(", "));

s = summarize(browserCapabilities({ ...good, localStorage: { setItem() { throw new Error("denied"); }, removeItem() {} } }));
check("storage that exists but refuses writes fails", !s.passed && s.missing.join() === "Local storage", s.missing.join(", "));

s = summarize(browserCapabilities({ ...good, navigator: {} }));
check("no media devices fails", !s.passed && s.missing[0].startsWith("Camera"), s.missing.join(", "));

s = summarize(browserCapabilities({ ...good, document: { fullscreenEnabled: false } }));
check("fullscreen switched off fails", !s.passed && s.missing.join() === "Fullscreen");

s = summarize(browserCapabilities({}));
check("an empty environment fails everything without throwing", !s.passed && s.missing.length === 7, String(s.missing.length));

check("a refused permission says to allow it", mediaErrorMessage("camera", { name: "NotAllowedError" }).includes("Allow it"));
check("a missing device says none was found", mediaErrorMessage("microphone", { name: "NotFoundError" }).startsWith("No microphone"));
check("a busy device says another app has it", mediaErrorMessage("camera", { name: "NotReadableError" }).includes("another app"));
check("an unknown failure still names itself", mediaErrorMessage("camera", { name: "WeirdError" }).includes("WeirdError"));

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
