import type {
  ActivityMessage,
  AssistantMessage,
  DeveloperMessage,
  MessagesSnapshotEvent,
  ReasoningMessage,
  SystemMessage,
  ToolMessage,
  UserMessage,
} from '@ag-ui/core';

import type { Recordable } from '@vben/types';

import type { AIChatProtocolName } from '../protocols/factory';
import type { AIChatMessageDetail, AIMessageType } from '../types/message';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import { requestClient } from '#/api/request';
import {
  buildAIChatCompletionRequest,
  normalizeAIChatConversationDetail,
} from '#/plugins/ai/protocols';

export type AIActionResult = null | string;

export interface AIChatForwardedPropsParams {
  enableBuiltinTools?: boolean;
  extraBody?: null | Recordable<unknown>;
  extraHeaders?: null | Recordable<string>;
  frequencyPenalty?: null | number;
  generationType?: AIChatGenerationType;
  imageAction?: AIChatImageActionType | null;
  imageAspectRatio?: AIChatImageAspectRatioType | null;
  imageBackground?: AIChatImageBackgroundType | null;
  imageInputFidelity?: AIChatImageInputFidelityType | null;
  imageModel?: null | string;
  imageModeration?: AIChatImageModerationType | null;
  imageOutputCompression?: null | number;
  imageOutputFormat?: AIChatImageOutputFormatType | null;
  imagePartialImages?: null | number;
  imageQuality?: AIChatImageQualityType | null;
  imageSize?: AIChatImageSizeType | null;
  logitBias?: null | Recordable<number>;
  maxTokens?: null | number;
  mcpIds?: null | number[];
  modelId: string;
  parallelToolCalls?: boolean | null;
  presencePenalty?: null | number;
  providerId: number;
  seed?: null | number;
  stopSequences?: null | string[];
  temperature?: null | number;
  thinking?: AIChatThinkingType | boolean | null;
  timeout?: null | number;
  topP?: null | number;
  webSearch?: AIWebSearchType;
}

export interface AIChatCompletionParams {
  conversationId?: null | string;
  forwardedProps: AIChatForwardedPropsParams;
  messages: AIChatProtocolMessagePayload;
}

export type AIChatProtocolInputMessage =
  | AssistantMessage
  | DeveloperMessage
  | SystemMessage
  | ToolMessage
  | UserMessage;

export type AIChatProtocolMessagePayload = AIChatProtocolInputMessage[];

export interface AIChatConversationResult {
  conversation_id: string;
  created_time: string;
  id: number;
  is_pinned: boolean;
  title: string;
  updated_time?: null | string;
}

interface AIChatProtocolMessageMetadata {
  content?: unknown;
  conversationId?: null | string;
  createdTime?: null | string;
  encryptedValue?: null | string;
  messageIndex?: null | number;
  messageType?: AIMessageType | null;
  modelId?: null | string;
  persistedMessageId?: null | number;
  providerId?: null | number;
}

export type AIChatProtocolConversationMessage =
  | (ActivityMessage & AIChatProtocolMessageMetadata)
  | (AIChatProtocolMessageMetadata & AssistantMessage)
  | (AIChatProtocolMessageMetadata & DeveloperMessage)
  | (AIChatProtocolMessageMetadata & ReasoningMessage)
  | (AIChatProtocolMessageMetadata & SystemMessage)
  | (AIChatProtocolMessageMetadata & ToolMessage)
  | (AIChatProtocolMessageMetadata & UserMessage);

export interface AIChatConversationDetailResult {
  contextClearedTime?: null | string;
  contextStartMessageId?: null | number;
  conversationId: string;
  createdTime: string;
  id: number;
  isPinned: boolean;
  messagesSnapshot: AIChatProtocolMessagesSnapshot;
  modelId: string;
  providerId: number;
  title: string;
  updatedTime?: null | string;
}

export type AIChatProtocolMessagesSnapshot = Omit<
  MessagesSnapshotEvent,
  'messages' | 'rawEvent'
> & {
  messages: AIChatProtocolConversationMessage[];
  rawEvent?: null | string;
};

export interface AIChatRegenerateParams {
  conversationId?: null | string;
  forwardedProps: AIChatForwardedPropsParams;
}

export type AIChatGenerationType = 'image' | 'text';
export type AIChatImageActionType = 'auto' | 'edit' | 'generate';
export type AIChatImageAspectRatioType =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9';
export type AIChatImageBackgroundType = 'auto' | 'opaque' | 'transparent';
export type AIChatImageInputFidelityType = 'high' | 'low';
export type AIChatImageModerationType = 'auto' | 'low';
export type AIChatImageOutputFormatType = 'jpeg' | 'png' | 'webp';
export type AIChatImageQualityType = 'auto' | 'high' | 'low' | 'medium';
export type AIChatImageSizeType =
  | '1K'
  | '2K'
  | '4K'
  | '512'
  | '1024x1024'
  | '1024x1536'
  | '1536x1024'
  | 'auto';
export type AIChatThinkingType =
  | 'high'
  | 'low'
  | 'medium'
  | 'minimal'
  | 'xhigh';
export type AIWebSearchType =
  | 'builtin'
  | 'duckduckgo'
  | 'exa'
  | 'off'
  | 'tavily';

export interface AIChatComposerParams {
  mode: 'create' | 'edit' | 'regenerate';
  conversation_id?: null | string;
  edit_message_id?: null | number;
  regenerate_message_id?: null | number;
  generation_type?: AIChatGenerationType;
  image_action?: AIChatImageActionType | null;
  image_aspect_ratio?: AIChatImageAspectRatioType | null;
  image_background?: AIChatImageBackgroundType | null;
  image_input_fidelity?: AIChatImageInputFidelityType | null;
  image_model?: null | string;
  image_moderation?: AIChatImageModerationType | null;
  image_output_compression?: null | number;
  image_output_format?: AIChatImageOutputFormatType | null;
  image_partial_images?: null | number;
  image_quality?: AIChatImageQualityType | null;
  image_size?: AIChatImageSizeType | null;
  provider_id: number;
  model_id: string;
  user_prompt?: null | string;
  max_tokens?: null | number;
  temperature?: null | number;
  top_p?: null | number;
  timeout?: null | number;
  parallel_tool_calls?: boolean | null;
  seed?: null | number;
  presence_penalty?: null | number;
  frequency_penalty?: null | number;
  logit_bias?: null | Recordable<number>;
  stop_sequences?: null | string[];
  extra_headers?: null | Recordable<string>;
  extra_body?: null | string;
  thinking?: AIChatThinkingType | boolean | null;
  enable_builtin_tools?: boolean;
  mcp_ids?: null | number[];
  web_search?: AIWebSearchType;
}

export interface AIChatConversationQueryParams {
  cursor?: null | string;
  size?: number;
}

export interface AIChatConversationListResult {
  items: AIChatConversationResult[];
  has_more: boolean;
  next_cursor?: null | string;
}

export interface AIChatConversationDetail {
  context_cleared_time?: null | string;
  context_start_message_id?: null | number;
  conversation_id: string;
  created_time: string;
  id: number;
  is_pinned: boolean;
  message_count?: number;
  messages: AIChatMessageDetail[];
  model_id: string;
  provider_id: number;
  title: string;
  updated_time?: null | string;
}

export interface AIChatConversationUpdateParams {
  title: string;
}

export interface AIChatConversationPinParams {
  is_pinned: boolean;
}

export interface AIChatMessageUpdateParams {
  content: string;
}

export type AIChatTransportMode =
  | 'create'
  | 'regenerate-from-message'
  | 'regenerate-from-response';

export interface AIChatTransportRequest {
  body: AIChatCompletionParams | AIChatRegenerateParams;
  conversationId?: string;
  messageId?: number;
  mode: AIChatTransportMode;
}

export interface BuildChatCompletionRequestInput {
  conversationId?: null | string;
  history: AIChatMessageDetail[];
  params: AIChatComposerParams;
  promptText?: string;
}

export interface AIChatProtocolOptions {
  protocolName?: AIChatProtocolName;
}

function parseExtraBody(
  raw: null | string | undefined,
): null | Recordable<unknown> | undefined {
  const text = raw?.trim();
  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Recordable<unknown>;
    }
  } catch {
    // Keep current page-level validation behavior.
  }

  return undefined;
}

function toForwardedProps(
  params: AIChatComposerParams,
): AIChatForwardedPropsParams {
  return {
    enableBuiltinTools: params.enable_builtin_tools ?? true,
    extraBody: parseExtraBody(params.extra_body),
    extraHeaders: params.extra_headers ?? undefined,
    frequencyPenalty: params.frequency_penalty,
    generationType: params.generation_type ?? 'text',
    imageAction: params.image_action,
    imageAspectRatio: params.image_aspect_ratio,
    imageBackground: params.image_background,
    imageInputFidelity: params.image_input_fidelity,
    imageModel: params.image_model,
    imageModeration: params.image_moderation,
    imageOutputCompression: params.image_output_compression,
    imageOutputFormat: params.image_output_format,
    imagePartialImages: params.image_partial_images,
    imageQuality: params.image_quality,
    imageSize: params.image_size,
    logitBias: params.logit_bias ?? undefined,
    maxTokens: params.max_tokens,
    mcpIds: params.mcp_ids ?? undefined,
    modelId: params.model_id,
    parallelToolCalls: params.parallel_tool_calls,
    presencePenalty: params.presence_penalty,
    providerId: params.provider_id,
    seed: params.seed,
    stopSequences: params.stop_sequences ?? undefined,
    temperature: params.temperature,
    thinking: params.thinking,
    timeout: params.timeout,
    topP: params.top_p,
    webSearch: params.web_search,
  };
}

export function buildChatCompletionRequest(
  input: BuildChatCompletionRequestInput,
  options: AIChatProtocolOptions = {},
): AIChatCompletionParams {
  return buildAIChatCompletionRequest(
    input,
    toForwardedProps(input.params),
    options.protocolName,
  );
}

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

function joinApiUrl(baseUrl: string, url: string) {
  if (/^https?:\/\//i.test(baseUrl)) {
    return new URL(url, baseUrl).toString();
  }
  return `${baseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

export function resolveAIChatTransportUrl(request: AIChatTransportRequest) {
  switch (request.mode) {
    case 'create': {
      return '/api/v1/chat/completions';
    }
    case 'regenerate-from-message': {
      return `/api/v1/conversations/${request.conversationId}/messages/${request.messageId}/regenerate`;
    }
    case 'regenerate-from-response': {
      return `/api/v1/conversations/${request.conversationId}/messages/${request.messageId}/responses/regenerate`;
    }
  }
}

export function resolveAIChatApiUrl(url: string) {
  return joinApiUrl(apiURL, url);
}

export function getAIChatRequestHeaders() {
  const accessStore = useAccessStore();

  return {
    Accept: 'text/event-stream, application/json',
    'Accept-Language': preferences.app.locale,
    Authorization: accessStore.accessToken
      ? `Bearer ${accessStore.accessToken}`
      : '',
    'Content-Type': 'application/json;charset=utf-8',
  };
}

export async function readAIChatErrorMessage(response: Response) {
  const text = await response.text();

  try {
    const payload = JSON.parse(text);
    return payload?.error ?? payload?.msg ?? payload?.message ?? text;
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

export async function getRecentAIChatConversationsApi(
  params?: AIChatConversationQueryParams,
) {
  const data = await requestClient.get<{
    has_more: boolean;
    items: AIChatConversationResult[];
    next_cursor?: null | string;
  }>('/api/v1/conversations', {
    params,
  });

  return {
    has_more: data.has_more,
    items: data.items,
    next_cursor: data.next_cursor ?? undefined,
  } satisfies AIChatConversationListResult;
}

export async function getAIChatConversationDetailApi(
  conversationId: string,
  options: AIChatProtocolOptions = {},
): Promise<AIChatConversationDetail> {
  const data = await requestClient.get<AIChatConversationDetailResult>(
    `/api/v1/conversations/${conversationId}`,
  );

  return normalizeAIChatConversationDetail(data, options.protocolName);
}

export async function updateAIChatConversationApi(
  conversationId: string,
  data: AIChatConversationUpdateParams,
) {
  return requestClient.put<AIActionResult>(
    `/api/v1/conversations/${conversationId}`,
    data,
  );
}

export async function deleteAIChatConversationApi(conversationId: string) {
  return requestClient.delete<AIActionResult>(
    `/api/v1/conversations/${conversationId}`,
  );
}

export async function pinAIChatConversationApi(
  conversationId: string,
  data: AIChatConversationPinParams,
) {
  return requestClient.put<AIActionResult>(
    `/api/v1/conversations/${conversationId}/pin`,
    data,
  );
}

export async function clearAIChatConversationMessagesApi(
  conversationId: string,
) {
  return requestClient.delete<AIActionResult>(
    `/api/v1/conversations/${conversationId}/messages`,
  );
}

export async function clearAIChatConversationContextApi(
  conversationId: string,
) {
  return requestClient.post<AIActionResult>(
    `/api/v1/conversations/${conversationId}/clear-context`,
  );
}

export async function deleteAIChatMessageApi(
  conversationId: string,
  messageId: number,
) {
  return requestClient.delete<AIActionResult>(
    `/api/v1/conversations/${conversationId}/messages/${messageId}`,
  );
}

export async function updateAIChatMessageApi(
  conversationId: string,
  messageId: number,
  data: AIChatMessageUpdateParams,
) {
  return requestClient.put<AIActionResult>(
    `/api/v1/conversations/${conversationId}/messages/${messageId}`,
    data,
  );
}
