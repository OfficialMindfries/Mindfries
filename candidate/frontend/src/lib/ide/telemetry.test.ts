import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryBuffer } from './telemetry';

// Mock the global fetch
const originalFetch = global.fetch;

describe('TelemetryBuffer', () => {
  let buffer: TelemetryBuffer;
  let fetchMock: any;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    buffer = new TelemetryBuffer('sess-123');
  });

  afterEach(() => {
    buffer.destroy();
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('records events and flushes them on interval', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    buffer.record('file_edit', { file: 'main.ts' });
    buffer.record('terminal', { cmd: 'ls' });

    // Ensure they are queued
    // @ts-expect-error accessing private property for testing
    expect(buffer.queue.length).toBe(2);

    // Advance time by 5 seconds to trigger interval flush
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchArgs = fetchMock.mock.calls[0];
    expect(fetchArgs[0]).toBe('/api/telemetry');
    
    const body = JSON.parse(fetchArgs[1].body);
    expect(body.sessionId).toBe('sess-123');
    expect(body.events.length).toBe(2);
    expect(body.events[0].type).toBe('file_edit');

    // Queue should be empty after successful flush
    // @ts-expect-error
    expect(buffer.queue.length).toBe(0);
  });

  it('restores batch to queue on non-2xx response (flush race fix)', async () => {
    // Simulate a 500 backend hiccup
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    buffer.record('file_edit', { file: 'main.ts' });

    // Force an immediate flush without waiting for timer
    await buffer.flush();

    // Since the flush failed, the event should be prepended back to the queue
    // @ts-expect-error
    expect(buffer.queue.length).toBe(1);
    // @ts-expect-error
    expect(buffer.queue[0].type).toBe('file_edit');
  });

  it('restores batch to queue on network error (flush race fix)', async () => {
    // Simulate a network failure where fetch throws
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    buffer.record('terminal', { cmd: 'npm test' });

    // Force an immediate flush
    await buffer.flush();

    // Event should be restored
    // @ts-expect-error
    expect(buffer.queue.length).toBe(1);
    // @ts-expect-error
    expect(buffer.queue[0].type).toBe('terminal');
  });

  it('triggers flush immediately when MAX_BATCH is reached', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    
    // MAX_BATCH is 25 in telemetry.ts
    for (let i = 0; i < 24; i++) {
      buffer.record('test_run', { count: i });
    }
    
    // At 24 events, flush should not be called yet
    expect(fetchMock).not.toHaveBeenCalled();
    
    // 25th event triggers flush immediately (without waiting for timer)
    buffer.record('test_run', { count: 24 });
    
    // Wait for the async flush promise to resolve
    await Promise.resolve(); 
    
    expect(fetchMock).toHaveBeenCalledTimes(1);
    
    // Queue should be empty after successful flush
    // @ts-expect-error
    expect(buffer.queue.length).toBe(0);
  });

  it('sends beacon on destroy', () => {
    const sendBeaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(global.navigator, 'sendBeacon', {
      value: sendBeaconMock,
      writable: true,
      configurable: true
    });

    buffer.record('file_edit', { file: 'exit.ts' });
    buffer.destroy();

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    expect(sendBeaconMock.mock.calls[0][0]).toBe('/api/telemetry');
    
    // We can't easily parse a Blob in Node.js test environment, 
    // but we can verify it was called.
    
    // Queue should be cleared
    // @ts-expect-error
    expect(buffer.queue.length).toBe(0);
  });
});
