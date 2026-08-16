import type { AIModelParams, AIStatusType } from '../../api';

export interface AIModelFormValues {
  model_id: string;
  remark?: null | string;
  status: AIStatusType;
}

export function createAIModelPayload(
  providerId: number,
  values: AIModelFormValues,
): AIModelParams {
  return {
    model_id: values.model_id.trim(),
    provider_id: providerId,
    remark: values.remark?.trim() || null,
    status: values.status,
  };
}
