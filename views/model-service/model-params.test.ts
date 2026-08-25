import { describe, expect, it } from 'vitest';

import { createAIModelPayload } from './model-params';

describe('createAIModelPayload', () => {
  it('trims model id and remark', () => {
    expect(
      createAIModelPayload(7, {
        model_id: '  gpt-test  ',
        remark: '  ',
        status: 1,
      }),
    ).toEqual({
      model_id: 'gpt-test',
      provider_id: 7,
      remark: null,
      status: 1,
    });
  });
});
