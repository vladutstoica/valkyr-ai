import { ipcMain, app } from 'electron';
import * as os from 'os';

export function registerResourceIpc(): void {
  ipcMain.handle('resource:getMetrics', async () => {
    try {
      const metrics = app.getAppMetrics();
      const totalMem = os.totalmem();

      let totalCpu = 0;
      let totalMemory = 0;

      const processes = metrics.map((m) => {
        const cpu = Math.round(m.cpu.percentCPUUsage * 10) / 10;
        const memory = Math.round(m.memory.workingSetSize / 1024); // KB to MB

        totalCpu += cpu;
        totalMemory += memory;

        return {
          pid: m.pid,
          type: m.type,
          name: m.name || m.type,
          cpu,
          memory,
        };
      });

      return {
        success: true,
        data: {
          totalCpu: Math.round(totalCpu * 10) / 10,
          totalMemory: Math.round(totalMemory * 10) / 10,
          ramShare: Math.round(((totalMemory * 1024 * 1024) / totalMem) * 100),
          processes,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
