import { describe, expect, it } from 'vitest';

import { createAIModelPayload } from './model-params';

describe('createAIModelPayload', () => {
  it('normalizes empty context limits to the latest backend contract', () => {
    expect(
      createAIModelPayload(7, {
        model_id: '  gpt-test  ',
        remark: '  ',
        status: 1,
      }),
    ).toEqual({
      context_keep_messages: 60,
      context_max_messages: null,
      context_max_part_chars: null,
      context_max_tokens: null,
      model_id: 'gpt-test',
      provider_id: 7,
      remark: null,
      status: 1,
    });
  });

  it('preserves explicit context limits including zero kept messages', () => {
    expect(
      createAIModelPayload(3, {
        context_keep_messages: 0,
        context_max_messages: 100,
        context_max_part_chars: 10_000,
        context_max_tokens: 128_000,
        model_id: 'claude-test',
        remark: 'long context',
        status: 0,
      }),
    ).toMatchObject({
      context_keep_messages: 0,
      context_max_messages: 100,
      context_max_part_chars: 10_000,
      context_max_tokens: 128_000,
    });
  });
});
