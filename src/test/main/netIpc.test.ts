import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Socket } from 'node:net';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();

// Factory for creating configurable fake net.Socket instances
type SocketEventMap = { connect?: () => void; error?: (e: Error) => void };

interface FakeSocketOpts {
  /** If true, the socket emits 'connect'. If false, emits 'error'. If undefined, times out. */
  connects?: boolean;
}

function makeSocketFactory(defaultOpts: FakeSocketOpts = {}) {
  return function createFakeSocket(_opts: { host: string; port: number }) {
    const listeners: SocketEventMap = {};
    let destroyed = false;

    const socket = {
      once: vi.fn((event: string, cb: any) => {
        (listeners as any)[event] = cb;
        return socket;
      }),
      destroy: vi.fn(() => {
        destroyed = true;
      }),
      get destroyed() {
        return destroyed;
      },
    } as unknown as Socket;

    // Schedule the event emission
    const { connects } = defaultOpts;
    if (connects !== undefined) {
      setTimeout(() => {
        if (connects) listeners.connect?.();
        else listeners.error?.(new Error('ECONNREFUSED'));
      }, 0);
    }
    // If connects is undefined, neither event fires → timeout triggers

    return socket;
  };
}

// The mock function Vitest will inject as net.createConnection
const createConnectionMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
      ipcHandlers.set(channel, cb);
    }),
  },
}));

// node:net is a CJS module — Vitest needs a `default` key alongside named exports
vi.mock('node:net', () => ({
  default: { createConnection: createConnectionMock },
  createConnection: createConnectionMock,
}));

async function callHandler(channel: string, ...args: any[]) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`);
  return handler({}, ...args);
}

beforeEach(async () => {
  vi.clearAllMocks();
  ipcHandlers.clear();
  vi.resetModules();

  vi.mock('electron', () => ({
    ipcMain: {
      handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcHandlers.set(channel, cb);
      }),
    },
  }));

  vi.mock('node:net', () => ({
    default: { createConnection: createConnectionMock },
    createConnection: createConnectionMock,
  }));

  const mod = await import('../../main/ipc/netIpc');
  mod.registerNetIpc();
});

describe('net:probePorts', () => {
  it('returns reachable ports when connections succeed', async () => {
    createConnectionMock.mockImplementation(makeSocketFactory({ connects: true }));

    const result = await callHandler('net:probePorts', 'localhost', [3000, 8080], 200);
    expect(result.reachable).toEqual(expect.arrayContaining([3000, 8080]));
    expect(result.reachable).toHaveLength(2);
  });

  it('returns empty reachable array when all connections fail', async () => {
    createConnectionMock.mockImplementation(makeSocketFactory({ connects: false }));

    const result = await callHandler('net:probePorts', 'localhost', [9999], 200);
    expect(result.reachable).toEqual([]);
  });

  it('returns only the reachable subset when some ports fail', async () => {
    createConnectionMock.mockImplementation((opts: { host: string; port: number }) => {
      const connects = opts.port === 3000;
      return makeSocketFactory({ connects })(opts);
    });

    const result = await callHandler('net:probePorts', 'localhost', [3000, 9999], 200);
    expect(result.reachable).toEqual([3000]);
  });

  it('returns empty reachable when ports array is empty', async () => {
    const result = await callHandler('net:probePorts', 'localhost', [], 200);
    expect(result).toEqual({ reachable: [] });
    // createConnection should never be called
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  it('returns empty reachable when ports is not an array', async () => {
    const result = await callHandler('net:probePorts', 'localhost', null, 200);
    expect(result).toEqual({ reachable: [] });
  });

  it('defaults to localhost when host is empty string', async () => {
    createConnectionMock.mockImplementation((opts: { host: string; port: number }) => {
      return makeSocketFactory({ connects: true })(opts);
    });

    await callHandler('net:probePorts', '', [80], 200);

    expect(createConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost' })
    );
  });

  it('defaults to localhost when host is whitespace-only', async () => {
    createConnectionMock.mockImplementation((opts: { host: string; port: number }) => {
      return makeSocketFactory({ connects: true })(opts);
    });

    await callHandler('net:probePorts', '   ', [80], 200);

    expect(createConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost' })
    );
  });

  it('uses the provided host when valid', async () => {
    createConnectionMock.mockImplementation((opts: { host: string; port: number }) => {
      return makeSocketFactory({ connects: true })(opts);
    });

    await callHandler('net:probePorts', '192.168.1.1', [22], 200);

    expect(createConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: '192.168.1.1' })
    );
  });

  it('filters out non-positive port numbers', async () => {
    createConnectionMock.mockImplementation(makeSocketFactory({ connects: true }));

    const result = await callHandler('net:probePorts', 'localhost', [0, -1, 80], 200);
    // Only port 80 is valid; 0 and -1 should be filtered
    expect(result.reachable).toEqual([80]);
    expect(createConnectionMock).toHaveBeenCalledTimes(1);
  });

  it('coerces string port numbers to integers', async () => {
    createConnectionMock.mockImplementation(makeSocketFactory({ connects: true }));

    // Simulate renderer sending ports as strings (common JSON edge case)
    const result = await callHandler('net:probePorts', 'localhost', ['3000' as any], 200);
    expect(result.reachable).toEqual([3000]);
  });

  it('uses 800ms default timeout when timeoutMs is not provided', async () => {
    createConnectionMock.mockImplementation((opts: { host: string; port: number }) => {
      return makeSocketFactory({ connects: true })(opts);
    });

    // No timeoutMs argument — defaults to 800
    await callHandler('net:probePorts', 'localhost', [3000]);
    expect(createConnectionMock).toHaveBeenCalled();
  });

  it('uses 800ms default timeout when timeoutMs is zero', async () => {
    createConnectionMock.mockImplementation(makeSocketFactory({ connects: true }));

    // timeoutMs = 0 should fall back to 800
    const result = await callHandler('net:probePorts', 'localhost', [3000], 0);
    expect(result.reachable).toEqual([3000]);
  });

  it('handles multiple ports probed in parallel', async () => {
    const ports = [3000, 3001, 3002, 3003, 3004];
    createConnectionMock.mockImplementation(makeSocketFactory({ connects: true }));

    const result = await callHandler('net:probePorts', 'localhost', ports, 200);
    expect(result.reachable).toHaveLength(ports.length);
  });

  it('probe result shape has only reachable key', async () => {
    createConnectionMock.mockImplementation(makeSocketFactory({ connects: false }));

    const result = await callHandler('net:probePorts', 'localhost', [1234], 200);
    expect(Object.keys(result)).toEqual(['reachable']);
  });

  it('handles NaN port entries gracefully (filters them out)', async () => {
    createConnectionMock.mockImplementation(makeSocketFactory({ connects: true }));

    const result = await callHandler('net:probePorts', 'localhost', [NaN, 80], 200);
    expect(result.reachable).toEqual([80]);
  });

  it('returns empty reachable for undefined ports argument', async () => {
    const result = await callHandler('net:probePorts', 'localhost', undefined, 200);
    expect(result).toEqual({ reachable: [] });
  });
});
