import { log } from '../lib/logger';
import { PROVIDER_TO_OPENROUTER } from '@shared/providers/modelIdMapping';

export type ModelMetadata = {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  maxCompletionTokens: number;
  pricing: {
    input: number; // $ per million tokens
    output: number; // $ per million tokens
  };
  modality: string;
};

type OpenRouterModel = {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  architecture?: { modality?: string };
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { max_completion_tokens?: number };
};

const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const OPENROUTER_API = 'https://openrouter.ai/api/v1/models';

export class ModelMetadataService {
  private cache: OpenRouterModel[] = [];
  private lastFetch = 0;
  private fetchPromise: Promise<void> | null = null;

  private async ensureCache(): Promise<void> {
    if (Date.now() - this.lastFetch < CACHE_TTL && this.cache.length > 0) return;
    if (this.fetchPromise) return this.fetchPromise;

    this.fetchPromise = this.fetchModels();
    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async fetchModels(): Promise<void> {
    try {
      const res = await fetch(OPENROUTER_API);
      if (!res.ok) throw new Error(`OpenRouter API returned ${res.status}`);
      const json = (await res.json()) as { data: OpenRouterModel[] };
      this.cache = json.data ?? [];
      this.lastFetch = Date.now();
      log.debug(`[ModelMetadata] Cached ${this.cache.length} models from OpenRouter`);
    } catch (err) {
      log.error('[ModelMetadata] Failed to fetch models from OpenRouter', err);
      // Keep stale cache if available
    }
  }

  async getModelMetadata(acpModelId: string, providerId: string): Promise<ModelMetadata | null> {
    await this.ensureCache();

    const prefix = PROVIDER_TO_OPENROUTER[providerId];
    if (!prefix) return null;

    // Search for matching model: "claude-opus-4" → "anthropic/claude-opus-4*"
    const searchId = `${prefix}/${acpModelId}`;
    const matches = this.cache
      .filter((m) => m.id.startsWith(searchId))
      .sort((a, b) => b.id.localeCompare(a.id)); // Latest date suffix first

    const model = matches[0];
    if (!model) return null;

    const promptPrice = parseFloat(model.pricing?.prompt ?? '0');
    const completionPrice = parseFloat(model.pricing?.completion ?? '0');

    return {
      id: model.id,
      name: model.name,
      description: model.description ?? '',
      contextLength: model.context_length ?? 0,
      maxCompletionTokens: model.top_provider?.max_completion_tokens ?? 0,
      pricing: {
        input: promptPrice * 1_000_000,
        output: completionPrice * 1_000_000,
      },
      modality: model.architecture?.modality ?? 'text',
    };
  }
}

export const modelMetadataService = new ModelMetadataService();
