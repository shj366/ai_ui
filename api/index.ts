import type { AIActionResult } from './chat';

import type { PaginationResult } from '#/types';

import { requestClient } from '#/api/request';

import { getAIChatRequestHeaders, resolveAIChatApiUrl } from './chat';
import { readOptionalDefaultModelResponse } from './response';

export type AIProviderType = 0 | 1 | 2 | 3 | 4 | 5;
export type AIStatusType = 0 | 1;

interface AIProviderQueryParams {
  cursor?: null | string;
  name?: null | string;
  status?: AIStatusType | null;
  type?: AIProviderType | null;
  size?: number;
}

export interface AIProviderParams {
  name: string;
  type: AIProviderType;
  api_key: string;
  api_host: string;
  status: AIStatusType;
  remark?: null | string;
}

export type AIProviderUpdateParams = AIProviderParams;

export interface AIProviderResult extends AIProviderParams {
  id: number;
  created_time: string;
  updated_time?: null | string;
}

export interface AIProviderModelResult {
  id: string;
  object: string;
  created: number;
}

export type AIDefaultModelOptionalResult = AIDefaultModelResult | null;

export interface AIProviderModelOptionResult {
  id: number;
  name: string;
  type: AIProviderType;
  status: AIStatusType;
  models: AIModelResult[];
}

export interface AIModelOptionsResult {
  providers: AIProviderModelOptionResult[];
  default_model?: AIDefaultModelResult | null;
}

export interface AIProviderListResult {
  items: AIProviderResult[];
  has_more: boolean;
  next_cursor?: null | string;
}

export interface AIModelQueryParams {
  provider_id?: null | number;
  model_id?: null | string;
  status?: AIStatusType | null;
  page?: number;
  size?: number;
}

export interface AIAllModelQueryParams {
  provider_id: number;
}

export interface AIModelParams {
  provider_id: number;
  model_id: string;
  status: AIStatusType;
  remark?: null | string;
}

export interface AIBatchCreateModelsParams {
  items: AIModelParams[];
}

export interface AIModelResult extends AIModelParams {
  id: number;
  created_time: string;
  updated_time?: null | string;
}

export interface AIDefaultModelParams {
  provider_id: number;
  model_id: string;
  status: AIStatusType;
}

export interface AIDefaultModelResult extends AIDefaultModelParams {
  id: number;
  scene: 'assistant';
  provider_name: string;
  provider_type: AIProviderType;
  created_time: string;
  updated_time?: null | string;
}

interface AIQuickPhraseQueryParams {
  content?: null | string;
  page?: number;
  size?: number;
}

export interface AIQuickPhraseParams {
  title: string;
  content: string;
  sort?: number;
}

export interface AIQuickPhraseResult extends AIQuickPhraseParams {
  id: number;
  user_id: number;
  created_time: string;
  updated_time?: null | string;
}

export async function getAIProviderDetailApi(pk: number) {
  return requestClient.get<AIProviderResult>(`/api/v1/providers/${pk}`);
}

export async function getAIProviderListApi(params?: AIProviderQueryParams) {
  return requestClient.get<AIProviderListResult>('/api/v1/providers', {
    params,
  });
}

export async function getAllAIProviderApi() {
  return requestClient.get<AIProviderResult[]>('/api/v1/providers/all');
}

export async function createAIProviderApi(data: AIProviderParams) {
  return requestClient.post<AIActionResult>('/api/v1/providers', data);
}

export async function updateAIProviderApi(
  pk: number,
  data: AIProviderUpdateParams,
) {
  return requestClient.put<AIActionResult>(`/api/v1/providers/${pk}`, data);
}

export async function deleteAIProviderApi(pks: number[]) {
  return requestClient.delete<AIActionResult>('/api/v1/providers', {
    data: { pks },
  });
}

export async function getAIProviderModelsApi(pk: number) {
  return requestClient.get<AIProviderModelResult[]>(
    `/api/v1/providers/${pk}/models`,
  );
}

export async function syncAIProviderModelsApi(pk: number) {
  return requestClient.post<AIActionResult>(
    `/api/v1/providers/${pk}/models/sync`,
  );
}

export async function getAIModelDetailApi(pk: number) {
  return requestClient.get<AIModelResult>(`/api/v1/models/${pk}`);
}

export async function getAIModelListApi(params?: AIModelQueryParams) {
  return requestClient.get<PaginationResult<AIModelResult>>('/api/v1/models', {
    params,
  });
}

export async function getAllAIModelApi(params: AIAllModelQueryParams) {
  return requestClient.get<AIModelResult[]>('/api/v1/models/all', {
    params,
  });
}

export async function getAIModelOptionsApi() {
  return requestClient.get<AIModelOptionsResult>('/api/v1/model-options');
}

export async function createAIModelApi(data: AIModelParams) {
  return requestClient.post<AIActionResult>('/api/v1/models', data);
}

export async function batchCreateAIModelApi(data: AIBatchCreateModelsParams) {
  return requestClient.post<AIActionResult>('/api/v1/models/batch', data);
}

export async function updateAIModelApi(pk: number, data: AIModelParams) {
  return requestClient.put<AIActionResult>(`/api/v1/models/${pk}`, data);
}

export async function deleteAIModelApi(pks: number[]) {
  return requestClient.delete<AIActionResult>('/api/v1/models', {
    data: { pks },
  });
}

export async function getAIAssistantDefaultModelApi() {
  return requestClient.get<AIDefaultModelResult>(
    '/api/v1/default-models/assistant',
  );
}

export async function getAIAssistantDefaultModelOptionalApi() {
  const response = await fetch(
    resolveAIChatApiUrl('/api/v1/default-models/assistant'),
    {
      headers: getAIChatRequestHeaders(),
      method: 'GET',
    },
  );

  return readOptionalDefaultModelResponse<AIDefaultModelResult>(response);
}

export async function updateAIAssistantDefaultModelApi(
  data: AIDefaultModelParams,
) {
  return requestClient.put<AIActionResult>(
    '/api/v1/default-models/assistant',
    data,
  );
}

export async function getAllAIQuickPhraseApi() {
  return requestClient.get<AIQuickPhraseResult[]>('/api/v1/quick-phrases/all');
}

export async function getAIQuickPhraseDetailApi(pk: number) {
  return requestClient.get<AIQuickPhraseResult>(`/api/v1/quick-phrases/${pk}`);
}

export async function getAIQuickPhraseListApi(
  params?: AIQuickPhraseQueryParams,
) {
  return requestClient.get<PaginationResult<AIQuickPhraseResult>>(
    '/api/v1/quick-phrases',
    { params },
  );
}

export async function createAIQuickPhraseApi(data: AIQuickPhraseParams) {
  return requestClient.post<AIActionResult>('/api/v1/quick-phrases', data);
}

export async function updateAIQuickPhraseApi(
  pk: number,
  data: AIQuickPhraseParams,
) {
  return requestClient.put<AIActionResult>(`/api/v1/quick-phrases/${pk}`, data);
}

export async function deleteAIQuickPhraseApi(pk: number) {
  return requestClient.delete<AIActionResult>(`/api/v1/quick-phrases/${pk}`);
}

export * from './chat';
export { readOptionalDefaultModelResponse } from './response';
