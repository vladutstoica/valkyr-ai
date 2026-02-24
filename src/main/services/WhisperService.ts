import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { existsSync, statSync, unlinkSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { log } from '../lib/logger';

const MODEL_DIR_NAME = 'voice-models';
const MODEL_FILE = 'ggml-base.en.bin';
const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';

type WhisperContext = {
  transcribeData: (
    data: ArrayBuffer,
    options: Record<string, unknown>
  ) => { stop: () => void; promise: Promise<{ result: string }> };
  release: () => Promise<void>;
};

export class WhisperService {
  private context: WhisperContext | null = null;
  private downloading = false;

  private getModelDir(): string {
    return join(app.getPath('userData'), MODEL_DIR_NAME);
  }

  private getModelPath(): string {
    return join(this.getModelDir(), MODEL_FILE);
  }

  getModelStatus(): { downloaded: boolean; sizeBytes?: number } {
    const modelPath = this.getModelPath();
    if (!existsSync(modelPath)) return { downloaded: false };
    try {
      const stats = statSync(modelPath);
      return { downloaded: true, sizeBytes: stats.size };
    } catch {
      return { downloaded: false };
    }
  }

  async downloadModel(): Promise<void> {
    if (this.downloading) throw new Error('Download already in progress');
    this.downloading = true;

    const modelDir = this.getModelDir();
    if (!existsSync(modelDir)) mkdirSync(modelDir, { recursive: true });

    const modelPath = this.getModelPath();
    const tmpPath = modelPath + '.tmp';

    try {
      const response = await fetch(MODEL_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      if (!response.body) throw new Error('No response body');

      const totalBytes = Number(response.headers.get('content-length') || 0);
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytesDownloaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        bytesDownloaded += value.length;

        const percent = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
        this.notifyProgress({ percent, bytesDownloaded, totalBytes });
      }

      // Write all chunks to file
      const fullBuffer = Buffer.concat(chunks);
      await writeFile(tmpPath, fullBuffer);

      // Rename tmp to final
      const { renameSync } = await import('fs');
      renameSync(tmpPath, modelPath);

      log.info(`Whisper model downloaded: ${modelPath} (${bytesDownloaded} bytes)`);
    } catch (err) {
      // Clean up partial download
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
      } catch {}
      throw err;
    } finally {
      this.downloading = false;
    }
  }

  async deleteModel(): Promise<void> {
    // Release context first if loaded
    await this.release();

    const modelPath = this.getModelPath();
    if (existsSync(modelPath)) {
      unlinkSync(modelPath);
      log.info(`Whisper model deleted: ${modelPath}`);
    }
  }

  async transcribe(pcmData: ArrayBuffer): Promise<string> {
    if (!this.context) {
      await this.initContext();
    }
    if (!this.context) throw new Error('Whisper model not loaded');

    const { promise } = this.context.transcribeData(pcmData, {
      language: 'en',
      temperature: 0.0,
    });

    const result = await promise;
    return result.result.trim();
  }

  async release(): Promise<void> {
    if (this.context) {
      try {
        await this.context.release();
      } catch {}
      this.context = null;
    }
  }

  private async initContext(): Promise<void> {
    const modelPath = this.getModelPath();
    if (!existsSync(modelPath)) throw new Error('Whisper model not downloaded');

    try {
      // Dynamic import to avoid loading native module until needed
      const { initWhisper } = await import('@fugood/whisper.node');
      this.context = await initWhisper({
        filePath: modelPath,
        useGpu: true,
      });
      log.info('Whisper context initialized');
    } catch (err) {
      log.error('Failed to initialize Whisper context:', err);
      throw err;
    }
  }

  private notifyProgress(data: {
    percent: number;
    bytesDownloaded: number;
    totalBytes: number;
  }): void {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('whisper:download-progress', data);
      } catch {}
    }
  }
}

export const whisperService = new WhisperService();
