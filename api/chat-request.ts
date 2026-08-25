import type { InputContent } from '@ag-ui/core';

import type { AIChatAttachmentType } from '../types/message';
import type {
  AIChatComposerAttachment,
  AIChatComposerParams,
  AIChatCompletionParams,
  AIChatForwardedPropsParams,
  AIChatRegenerateParams,
  BuildChatCompletionRequestInput,
  BuildChatRegenerateRequestInput,
} from './chat';

export interface AIChatRequestDependencies {
  inferAttachmentType: (
    name?: null | string,
    mimeType?: null | string,
  ) => AIChatAttachmentType | null;
  resolveUrl: (url: string) => string;
}

function toForwardedProps(
  params: AIChatComposerParams,
): AIChatForwardedPropsParams {
  return {
    modelId: params.model_id,
    providerId: params.provider_id,
  };
}

function createAttachmentContent(
  attachment: AIChatComposerAttachment,
  dependencies: AIChatRequestDependencies,
): InputContent | null {
  const mimeType = attachment.mime_type || 'application/octet-stream';
  const filename = attachment.name || 'attachment';
  const attachmentUrl = attachment.url
    ? dependencies.resolveUrl(attachment.url)
    : null;
  const metadata = { filename, size: attachment.size ?? undefined };
  const fileType =
    attachment.file_type ??
    dependencies.inferAttachmentType(filename, mimeType) ??
    'document';

  if (attachmentUrl) {
    return {
      metadata,
      source: { mimeType, type: 'url', value: attachmentUrl },
      type: fileType,
    } as InputContent;
  }

  if (!attachment.data) {
    return null;
  }

  return {
    metadata,
    source: { mimeType, type: 'data', value: attachment.data },
    type: fileType,
  } as InputContent;
}

export function buildAIChatCompletionRequest(
  input: BuildChatCompletionRequestInput,
  dependencies: AIChatRequestDependencies,
): AIChatCompletionParams {
  const text = input.promptText?.trim();
  const attachmentContents = (input.attachments ?? [])
    .map((attachment) => createAttachmentContent(attachment, dependencies))
    .filter((item): item is InputContent => item !== null);
  const content =
    attachmentContents.length === 0
      ? text
      : [
          ...(text ? [{ text, type: 'text' as const }] : []),
          ...attachmentContents,
        ];

  if (!content) {
    throw new Error('聊天消息不能为空');
  }

  return {
    conversationId: input.conversationId ?? undefined,
    forwardedProps: toForwardedProps(input.params),
    messages: [
      {
        content,
        id: `user-draft-${Date.now()}`,
        role: 'user',
      },
    ],
  };
}

export function buildAIChatRegenerateRequest(
  input: BuildChatRegenerateRequestInput,
): AIChatRegenerateParams {
  return {
    ...(input.content?.trim() ? { content: input.content.trim() } : {}),
    conversationId: input.conversationId,
    forwardedProps: toForwardedProps(input.params),
  };
}
