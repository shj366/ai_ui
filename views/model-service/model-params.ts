import type { AIModelParams, AIStatusType } from '../../api';

export interface AIModelFormValues {
  context_keep_messages?: null | number;
  context_max_messages?: null | number;
  context_max_part_chars?: null | number;
  context_max_tokens?: null | number;
  model_id: string;
  remark?: null | string;
  status: AIStatusType;
}

function normalizeNullablePositiveInteger(value?: null | number) {
  return typeof value === 'number' ? value : null;
}

export function createAIModelPayload(
  providerId: number,
  values: AIModelFormValues,
): AIModelParams {
  return {
    context_keep_messages:
      typeof values.context_keep_messages === 'number'
        ? values.context_keep_messages
        : 60,
    context_max_messages: normalizeNullablePositiveInteger(
      values.context_max_messages,
    ),
    context_max_part_chars: normalizeNullablePositiveInteger(
      values.context_max_part_chars,
    ),
    context_max_tokens: normalizeNullablePositiveInteger(
      values.context_max_tokens,
    ),
    model_id: values.model_id.trim(),
    provider_id: providerId,
    remark: values.remark?.trim() || null,
    status: values.status,
  };
}
