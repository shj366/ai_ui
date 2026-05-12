import type { Recordable } from '@vben/types';

import type { AIActionResult } from './chat';

import type { PaginationResult } from '#/types';

import { requestClient } from '#/api/request';

interface AIProviderQueryParams {
  cursor?: null | string;
  name?: null | string;
  status?: null | number;
  type?: null | number;
  size?: number;
}

export interface AIProviderParams {
  name: string;
  type: number;
  api_key: string;
  api_host: string;
  status: number;
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

export interface AIProviderListResult {
  items: AIProviderResult[];
  has_more: boolean;
  next_cursor?: null | string;
}

export interface AIModelQueryParams {
  provider_id?: null | number;
  model_id?: null | string;
  status?: null | number;
  page?: number;
  size?: number;
}

export interface AIAllModelQueryParams {
  provider_id: number;
}

export interface AIModelParams {
  provider_id: number;
  model_id: string;
  status: number;
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

export interface AIMcpQueryParams {
  name?: null | string;
  page?: number;
  size?: number;
  type?: null | number;
}

export interface AIMcpParams {
  name: string;
  type?: number;
  description?: null | string;
  url?: null | string;
  headers?: null | Recordable<unknown>;
  command: string;
  args?: null | string[];
  env?: null | Recordable<unknown>;
  timeout?: null | number;
  read_timeout?: null | number;
  tool_prefix?: null | string;
  include_instructions?: boolean;
}

export interface AIMcpResult extends AIMcpParams {
  id: number;
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

export async function getAIMcpDetailApi(pk: number) {
  return requestClient.get<AIMcpResult>(`/api/v1/mcps/${pk}`);
}

export async function getAIMcpListApi(params?: AIMcpQueryParams) {
  return requestClient.get<PaginationResult<AIMcpResult>>('/api/v1/mcps', {
    params,
  });
}

export async function getAllAIMcpApi() {
  return requestClient.get<AIMcpResult[]>('/api/v1/mcps/all');
}

export async function createAIMcpApi(data: AIMcpParams) {
  return requestClient.post<AIActionResult>('/api/v1/mcps', data);
}

export async function updateAIMcpApi(pk: number, data: AIMcpParams) {
  return requestClient.put<AIActionResult>(`/api/v1/mcps/${pk}`, data);
}

export async function deleteAIMcpApi(pk: number) {
  return requestClient.delete<AIActionResult>(`/api/v1/mcps/${pk}`);
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
    {
      params,
    },
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
