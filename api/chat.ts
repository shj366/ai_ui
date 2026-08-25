import type {
  AssistantMessage,
  DeveloperMessage,
  MessagesSnapshotEvent,
  SystemMessage,
  UserMessage,
} from '@ag-ui/core';

import type {
  AIChatAttachmentType,
  AIChatMessageDetail,
  AIMessageType,
} from '../types/message';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import { requestClient } from '#/api/request';

import { normalizeAGUIConversationDetail } from '../runtime/ag-ui/deserialize';
import {
  buildAIChatCompletionRequest,
  buildAIChatRegenerateRequest,
} from './chat-request';

export type AIActionResult = null | string;

export interface AIChatForwardedPropsParams {
  modelId: string;
  providerId: number;
}

export interface AIChatCompletionParams {
  conversationId?: null | string;
  forwardedProps: AIChatForwardedPropsParams;
  messages: [AIChatProtocolInputMessage, ...AIChatProtocolInputMessage[]];
}

export type AIChatProtocolInputMessage =
  | AssistantMessage
  | DeveloperMessage
  | SystemMessage
  | UserMessage;

export type AIChatProtocolMessagePayload = AIChatProtocolInputMessage[];

export interface AIChatConversationResult {
  conversation_id: string;
  created_time: string;
  id: number;
  is_generating?: boolean;
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
  | (AIChatProtocolMessageMetadata & AssistantMessage)
  | (AIChatProtocolMessageMetadata & DeveloperMessage)
  | (AIChatProtocolMessageMetadata & SystemMessage)
  | (AIChatProtocolMessageMetadata & UserMessage);

export interface AIChatConversationDetailResult {
  conversationId: string;
  createdTime: string;
  id: number;
  isGenerating?: boolean;
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
  content?: null | string;
  conversationId?: null | string;
  forwardedProps: AIChatForwardedPropsParams;
}

export interface AIChatComposerParams {
  mode: 'create' | 'edit' | 'regenerate';
  conversation_id?: null | string;
  edit_message_id?: null | number;
  regenerate_message_id?: null | number;
  provider_id: number;
  model_id: string;
}

export interface AIChatComposerAttachment {
  data?: null | string;
  file_type?: AIChatAttachmentType | null;
  id?: string;
  mime_type?: null | string;
  name?: null | string;
  size?: null | number;
  source_type?: 'base64' | 'url' | null;
  url?: null | string;
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
  conversation_id: string;
  created_time: string;
  id: number;
  is_generating?: boolean;
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

export type AIChatTransportMode = 'create' | 'regenerate-from-message';

export interface AIChatTransportRequest {
  body: AIChatCompletionParams | AIChatRegenerateParams;
  conversationId?: string;
  messageId?: number;
  mode: AIChatTransportMode;
}

export interface BuildChatCompletionRequestInput {
  attachments?: AIChatComposerAttachment[];
  conversationId?: null | string;
  params: AIChatComposerParams;
  promptText?: string;
}

export interface BuildChatRegenerateRequestInput {
  content?: null | string;
  conversationId: string;
  params: AIChatComposerParams;
}

export function inferAIChatAttachmentType(
  name?: null | string,
  mimeType?: null | string,
): AIChatAttachmentType | null {
  if (mimeType?.startsWith('audio/')) {
    return 'audio';
  }
  if (mimeType?.startsWith('image/')) {
    return 'image';
  }
  if (mimeType?.startsWith('video/')) {
    return 'video';
  }

  const lowerName = name?.toLowerCase() ?? '';
  if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/u.test(lowerName)) {
    return 'image';
  }
  if (/\.(aac|flac|m4a|mp3|ogg|wav|weba)$/u.test(lowerName)) {
    return 'audio';
  }
  if (/\.(avi|m4v|mkv|mov|mp4|mpeg|webm)$/u.test(lowerName)) {
    return 'video';
  }

  return 'document';
}

export function buildChatCompletionRequest(
  input: BuildChatCompletionRequestInput,
): AIChatCompletionParams {
  return buildAIChatCompletionRequest(input, {
    inferAttachmentType: inferAIChatAttachmentType,
    resolveUrl: resolveAIChatApiUrl,
  });
}

export function buildChatRegenerateRequest(
  input: BuildChatRegenerateRequestInput,
): AIChatRegenerateParams {
  return buildAIChatRegenerateRequest(input);
}

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

function joinApiUrl(baseUrl: string, url: string) {
  if (/^(blob:|data:|https?:\/\/)/iu.test(url)) {
    return url;
  }

  if (/^https?:\/\//i.test(baseUrl)) {
    return new URL(url, baseUrl).toString();
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  if (
    normalizedBaseUrl &&
    (url === normalizedBaseUrl || url.startsWith(`${normalizedBaseUrl}/`))
  ) {
    return url;
  }

  return `${normalizedBaseUrl}/${url.replace(/^\/+/, '')}`;
}

export { resolveAIChatTransportUrl } from './chat-transport';

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

export { readAIChatErrorMessage } from './response';

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
): Promise<AIChatConversationDetail> {
  const data = await requestClient.get<AIChatConversationDetailResult>(
    `/api/v1/conversations/${conversationId}`,
  );

  return normalizeAGUIConversationDetail(data);
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

export async function stopAIChatConversationApi(conversationId: string) {
  return requestClient.post<AIActionResult>(
    `/api/v1/conversations/${conversationId}/stop`,
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
