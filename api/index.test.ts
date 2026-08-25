import { describe, expect, it } from 'vitest';

import { readOptionalDefaultModelResponse } from './response';

describe('readOptionalDefaultModelResponse', () => {
  it('maps an explicit not-found response to an unconfigured model', async () => {
    await expect(
      readOptionalDefaultModelResponse(new Response(null, { status: 404 })),
    ).resolves.toBeNull();
  });

  it('returns a configured assistant model', async () => {
    const model = {
      created_time: '2026-07-12T00:00:00Z',
      id: 1,
      model_id: 'gpt-test',
      provider_id: 2,
      provider_name: 'OpenAI',
      provider_type: 0 as const,
      scene: 'assistant' as const,
      status: 1 as const,
    };

    await expect(
      readOptionalDefaultModelResponse(
        Response.json({ code: 200, data: model, msg: '请求成功' }),
      ),
    ).resolves.toEqual(model);
  });

  it('does not hide authentication or server errors', async () => {
    await expect(
      readOptionalDefaultModelResponse(
        Response.json({ code: 401, msg: '登录已过期' }, { status: 401 }),
      ),
    ).rejects.toThrow('登录已过期');
  });
});
