import type {
  AIDefaultModelResult,
  AIModelOptionsResult,
  AIModelResult,
  AIProviderModelOptionResult,
} from '../../api';

export interface NormalizedAIModelOptions {
  defaultModel: AIDefaultModelResult | null;
  models: AIModelResult[];
  providers: AIProviderModelOptionResult[];
}

export function normalizeAIModelOptions(
  data: AIModelOptionsResult,
): NormalizedAIModelOptions {
  return {
    defaultModel: data.default_model ?? null,
    models: data.providers.flatMap((provider) => provider.models),
    providers: data.providers,
  };
}
