// mammoth ships a browser build with no bundled types for that entry point
// (only its Node entry is typed). Declared minimally here — just the one
// function resumeParse.ts actually calls.
declare module "mammoth/mammoth.browser" {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
}
