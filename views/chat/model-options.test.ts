import type { AIModelOptionsResult } from '../../api';

import { describe, expect, it } from 'vitest';

import { normalizeAIModelOptions } from './model-options';

describe('normalizeAIModelOptions', () => {
  it('flattens provider models and keeps the assistant default model', () => {
    const data = {
      default_model: {
        created_time: '2026-07-12T00:00:00Z',
        id: 9,
        model_id: 'model-b',
        provider_id: 2,
        provider_name: 'Provider B',
        provider_type: 1,
        scene: 'assistant',
        status: 1,
      },
      providers: [
        {
          id: 1,
          models: [
            {
              created_time: '2026-07-12T00:00:00Z',
              id: 11,
              model_id: 'model-a',
              provider_id: 1,
              status: 1,
            },
          ],
          name: 'Provider A',
          status: 1,
          type: 0,
        },
        {
          id: 2,
          models: [
            {
              created_time: '2026-07-12T00:00:00Z',
              id: 12,
              model_id: 'model-b',
              provider_id: 2,
              status: 1,
            },
          ],
          name: 'Provider B',
          status: 1,
          type: 1,
        },
      ],
    } satisfies AIModelOptionsResult;

    const result = normalizeAIModelOptions(data);

    expect(result.models.map((model) => model.model_id)).toEqual([
      'model-a',
      'model-b',
    ]);
    expect(result.defaultModel?.model_id).toBe('model-b');
    expect(result.providers).toHaveLength(2);
  });

  it.each([
    ['missing', {}],
    ['null', { default_model: null }],
  ])('supports an unconfigured default model represented as %s', (_, extra) => {
    const result = normalizeAIModelOptions({
      providers: [],
      ...extra,
    });

    expect(result.defaultModel).toBeNull();
    expect(result.models).toEqual([]);
  });
});
