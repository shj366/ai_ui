import type { ChatMessageItem } from '../../../runtime/message';

import { message } from 'antdv-next';

import { baseRequestClient } from '#/api/request';
import { triggerBlobDownload } from '#/plugins/attachment_export/api';

import {
  getMessageEventBlocks,
  getMessageTextContent,
} from '../../../runtime/message';

interface DownloadAttachmentsCommand {
  action: 'download_attachments' | 'download_qualification_attachments';
  entity_ids: number[];
  entity_type: string;
}

interface DownloadAttachmentsCommandMatch {
  command: DownloadAttachmentsCommand;
  sourceKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEntityIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(Number).filter((item) => Number.isInteger(item) && item > 0);
}

function normalizeDownloadCommand(
  value: unknown,
): DownloadAttachmentsCommand | null {
  if (!isRecord(value)) {
    return null;
  }

  const action = value.action;
  const entityType = value.entity_type;
  const entityIds = normalizeEntityIds(value.entity_ids);

  if (
    (action !== 'download_attachments' &&
      action !== 'download_qualification_attachments') ||
    typeof entityType !== 'string' ||
    !entityType.trim() ||
    entityIds.length === 0
  ) {
    return null;
  }

  return {
    action,
    entity_ids: entityIds,
    entity_type: entityType.trim(),
  };
}

function parseDownloadCommandText(text: string) {
  const commands: DownloadAttachmentsCommand[] = [];
  const markerPattern =
    /__DOWNLOAD_COMMAND__([\s\S]*?)__DOWNLOAD_COMMAND_END__/gu;

  for (const match of text.matchAll(markerPattern)) {
    const rawCommand = match[1]?.trim();
    if (!rawCommand) {
      continue;
    }

    try {
      const command = normalizeDownloadCommand(JSON.parse(rawCommand));
      if (command) {
        commands.push(command);
      }
    } catch {
      // Ignore malformed legacy command markers.
    }
  }

  try {
    const command = normalizeDownloadCommand(JSON.parse(text.trim()));
    if (command) {
      commands.push(command);
    }
  } catch {
    // Plain assistant text is not expected to be JSON.
  }

  return commands;
}

function collectDownloadCommands(
  messageItem: ChatMessageItem,
): DownloadAttachmentsCommandMatch[] {
  const commands: DownloadAttachmentsCommand[] = [];
  const textContent = getMessageTextContent(messageItem);
  if (textContent) {
    commands.push(...parseDownloadCommandText(textContent));
  }

  for (const block of getMessageEventBlocks(messageItem)) {
    const data = isRecord(block.data) ? block.data : null;
    const content = data?.content;

    if (typeof content === 'string') {
      commands.push(...parseDownloadCommandText(content));
    }

    const contentPreview = data?.contentPreview;
    if (typeof contentPreview === 'string') {
      commands.push(...parseDownloadCommandText(contentPreview));
    }

    const directCommand = normalizeDownloadCommand(data);
    if (directCommand) {
      commands.push(directCommand);
    }
  }

  return commands.map((command) => ({
    command,
    sourceKey: messageItem.id,
  }));
}

function getCommandKey(match: DownloadAttachmentsCommandMatch) {
  const { command } = match;
  return `${match.sourceKey}:${command.action}:${command.entity_type}:${command.entity_ids.join(',')}`;
}

function getDefaultFilename(command: DownloadAttachmentsCommand) {
  return command.entity_ids.length === 1
    ? `${command.entity_type}_${command.entity_ids[0]}_attachments.zip`
    : `${command.entity_type}_${command.entity_ids.length}_items.zip`;
}

function parseFilenameFromDisposition(disposition?: string) {
  if (!disposition) {
    return null;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/iu);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const filenameMatch = disposition.match(/filename="?([^";]+)"?/iu);
  if (filenameMatch?.[1]) {
    return decodeURIComponent(filenameMatch[1]);
  }

  return null;
}

async function getAuthHeaders() {
  const { useAccessStore } = await import('@vben/stores');
  const { preferences } = await import('@vben/preferences');

  const accessStore = useAccessStore();
  return {
    Authorization: accessStore.accessToken
      ? `Bearer ${accessStore.accessToken}`
      : '',
    'Accept-Language': preferences.app.locale,
  };
}

async function downloadChatAttachments(command: DownloadAttachmentsCommand) {
  const response = await baseRequestClient.post(
    '/api/v1/attachment_export/attachments/download',
    {
      entity_ids: command.entity_ids,
      entity_type: command.entity_type,
    },
    {
      headers: await getAuthHeaders(),
      responseType: 'blob',
      timeout: 300_000,
    },
  );

  return {
    blob: new Blob([response.data], { type: 'application/zip' }),
    filename:
      parseFilenameFromDisposition(response.headers['content-disposition']) ??
      getDefaultFilename(command),
  };
}

export function useChatAttachmentDownloads() {
  const executedCommandKeys = new Set<string>();

  async function executeAttachmentDownloads(messages: ChatMessageItem[]) {
    const commands = messages.flatMap((item) => collectDownloadCommands(item));

    for (const match of commands) {
      const { command } = match;
      const commandKey = getCommandKey(match);
      if (executedCommandKeys.has(commandKey)) {
        continue;
      }

      executedCommandKeys.add(commandKey);
      message.loading({
        content: 'Downloading attachments...',
        duration: 0,
        key: 'ai-attachment-download',
      });

      try {
        const { blob, filename } = await downloadChatAttachments(command);
        triggerBlobDownload(blob, filename);
        message.success({
          content: 'Attachment download started',
          duration: 2,
          key: 'ai-attachment-download',
        });
      } catch (error) {
        executedCommandKeys.delete(commandKey);
        message.error({
          content:
            error instanceof Error
              ? error.message
              : 'Attachment download failed',
          duration: 3,
          key: 'ai-attachment-download',
        });
      }
    }
  }

  return {
    executeAttachmentDownloads,
  };
}
