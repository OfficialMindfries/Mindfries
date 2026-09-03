/**
 * Splitting a pasted chunk into commands.
 *
 * xterm hands a paste to `onData` as a SINGLE chunk with its line breaks
 * normalized to "\r" — it is not delivered keystroke by keystroke. So the
 * terminal has to split it itself; otherwise the whole paste lands on one
 * line with literal control characters embedded and nothing runs.
 */

export interface PasteSplit {
  /** The line to run now: the current buffer with the paste's first segment spliced in at the cursor. */
  line: string;
  /** Complete lines after that one, to run in order. */
  queued: string[];
  /** Text following the final line break — belongs on the prompt, unexecuted. */
  pending: string;
}

/** True when a chunk carries line breaks, i.e. it's a paste rather than a keystroke. */
export function isMultiLineInput(data: string): boolean {
  return data.length > 1 && /[\r\n]/.test(data);
}

export function splitPastedInput(data: string, buffer: string, cursor: number): PasteSplit {
  const segments = data.split(/\r\n|[\r\n]/);
  // A paste ending in a line break leaves "" here, so nothing is left on the
  // prompt — which is what makes a trailing newline run the last command.
  const pending = segments.pop() ?? "";
  return {
    line: buffer.slice(0, cursor) + segments[0] + buffer.slice(cursor),
    queued: segments.slice(1),
    pending,
  };
}
