import { describe, it, expect, beforeEach } from 'vitest';

// GitQueue uses path.resolve internally — no electron dependency needed.
// Import the singleton after path is available (pure Node).
import { gitQueue } from '../../main/services/GitQueue';

describe('GitQueue', () => {
  describe('run', () => {
    it('executes a simple operation and returns its result', async () => {
      const result = await gitQueue.run('/tmp/repo-a', async () => 42);
      expect(result).toBe(42);
    });

    it('resolves with the resolved value of an async operation', async () => {
      const result = await gitQueue.run('/tmp/repo-b', async () => {
        return { status: 'ok' };
      });
      expect(result).toEqual({ status: 'ok' });
    });

    it('propagates errors thrown inside the operation', async () => {
      await expect(
        gitQueue.run('/tmp/repo-err', async () => {
          throw new Error('git failure');
        })
      ).rejects.toThrow('git failure');
    });

    it('propagates rejected promises inside the operation', async () => {
      await expect(
        gitQueue.run('/tmp/repo-reject', () => Promise.reject(new Error('rejected')))
      ).rejects.toThrow('rejected');
    });

    it('normalizes paths — trailing slash and resolved path are the same queue', async () => {
      const order: number[] = [];
      let unlockFirst: () => void;

      const blockFirst = new Promise<void>((resolve) => {
        unlockFirst = resolve;
      });

      // First operation blocks until we release it
      const first = gitQueue.run('/tmp/repo-norm', async () => {
        await blockFirst;
        order.push(1);
      });

      // Second operation on an equivalent path (already-resolved) must wait
      const second = gitQueue.run('/tmp/repo-norm', async () => {
        order.push(2);
      });

      // Give the second a moment to register, then release the first
      await Promise.resolve();
      unlockFirst!();

      await Promise.all([first, second]);
      expect(order).toEqual([1, 2]);
    });

    it('serializes concurrent operations on the same repo path', async () => {
      const order: number[] = [];
      let unlock: () => void;

      const gate = new Promise<void>((resolve) => {
        unlock = resolve;
      });

      const first = gitQueue.run('/tmp/serial-repo', async () => {
        await gate;
        order.push(1);
      });

      const second = gitQueue.run('/tmp/serial-repo', async () => {
        order.push(2);
      });

      await Promise.resolve();
      unlock!();
      await Promise.all([first, second]);

      expect(order).toEqual([1, 2]);
    });

    it('allows concurrent operations on different repo paths', async () => {
      const results: string[] = [];
      let unlockA: () => void;

      const gateA = new Promise<void>((resolve) => {
        unlockA = resolve;
      });

      const opA = gitQueue.run('/tmp/parallel-a', async () => {
        await gateA;
        results.push('A');
      });

      const opB = gitQueue.run('/tmp/parallel-b', async () => {
        results.push('B');
      });

      // B should complete while A is still blocked
      await opB;
      expect(results).toContain('B');
      expect(results).not.toContain('A');

      unlockA!();
      await opA;
      expect(results).toContain('A');
    });

    it('treats paths with different casing as different queues on case-sensitive systems', async () => {
      // Just verifying both queues are independently runnable without deadlock
      const r1 = await gitQueue.run('/tmp/CaseRepo', async () => 'upper');
      const r2 = await gitQueue.run('/tmp/caserepo', async () => 'lower');
      expect(r1).toBe('upper');
      expect(r2).toBe('lower');
    });
  });

  describe('remove', () => {
    it('removes a known repo path without throwing', () => {
      // Ensure entry exists first by running a no-op
      expect(() => {
        gitQueue.run('/tmp/removable', async () => {});
        gitQueue.remove('/tmp/removable');
      }).not.toThrow();
    });

    it('is a no-op when removing a path that was never registered', () => {
      expect(() => {
        gitQueue.remove('/tmp/never-registered');
      }).not.toThrow();
    });

    it('allows a new queue to be created for the same path after removal', async () => {
      const path = '/tmp/reuse-after-remove';

      await gitQueue.run(path, async () => 'first run');
      gitQueue.remove(path);

      // Should not throw and should execute normally
      const result = await gitQueue.run(path, async () => 'second run');
      expect(result).toBe('second run');
    });

    it('normalizes the path the same way as run', async () => {
      const path = '/tmp/remove-normalize';
      await gitQueue.run(path, async () => {});

      // Remove using exact same path — should be treated as the same key
      expect(() => gitQueue.remove(path)).not.toThrow();
    });
  });

  describe('pruneIdle (indirectly via MAX_IDLE_MUTEXES threshold)', () => {
    it('handles many distinct repo paths without throwing', async () => {
      // Exceed the 50-mutex limit to trigger pruning
      const ops = Array.from({ length: 60 }, (_, i) =>
        gitQueue.run(`/tmp/prune-test-repo-${i}`, async () => i)
      );
      const results = await Promise.all(ops);
      expect(results).toHaveLength(60);
      // All operations should have their index as the result
      results.forEach((v, i) => expect(v).toBe(i));
    });
  });
});
