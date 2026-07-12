import type { Recordable } from '@vben/types';

function formatValidationDetail(detail: unknown) {
  if (typeof detail === 'string') {
    return detail;
  }

  if (!Array.isArray(detail)) {
    return '';
  }

  return detail
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }

      const record = item as Recordable<unknown>;
      const loc = Array.isArray(record.loc) ? record.loc.join('.') : '';
      const msg = typeof record.msg === 'string' ? record.msg : '';
      return [loc, msg].filter(Boolean).join(': ');
    })
    .filter(Boolean)
    .join('\n');
}

export async function readAIChatErrorMessage(response: Response) {
  const text = await response.text();

  try {
    const payload = JSON.parse(text);
    const validationMessage = formatValidationDetail(payload?.detail);
    return (
      payload?.error ||
      payload?.msg ||
      payload?.message ||
      validationMessage ||
      text ||
      `HTTP ${response.status}`
    );
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

interface ResponseSchema<T> {
  code: number;
  data?: T;
  msg?: string;
}

export async function readOptionalDefaultModelResponse<T>(
  response: Response,
): Promise<null | T> {
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await readAIChatErrorMessage(response));
  }

  const payload = (await response.json()) as ResponseSchema<T>;
  if (payload.code === 404) {
    return null;
  }

  if (payload.code !== 200 || !payload.data) {
    throw new Error(payload.msg || '获取默认助手模型失败');
  }

  return payload.data;
}
