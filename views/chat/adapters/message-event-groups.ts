import type { AIChatEventMessageBlock } from '../../../types/message';

export const TOOL_CALL_ARG_EVENT_TYPES = new Set([
  'TOOL_CALL_ARGS',
  'TOOL_CALL_CHUNK',
]);
export const TOOL_CALL_END_EVENT_TYPES = new Set(['TOOL_CALL_END']);
export const TOOL_APPROVAL_REQUEST_EVENT_TYPES = new Set([
  'TOOL_APPROVAL_REQUEST',
  'TOOL_APPROVAL_REQUESTED',
  'TOOL_CALL_APPROVAL_REQUEST',
  'TOOL_CALL_APPROVAL_REQUESTED',
]);
export const TOOL_APPROVAL_RESPONSE_EVENT_TYPES = new Set([
  'TOOL_APPROVAL_RESPONSE',
  'TOOL_APPROVAL_RESPONDED',
  'TOOL_CALL_APPROVAL_RESPONSE',
  'TOOL_CALL_APPROVAL_RESPONDED',
]);
export const TOOL_CALL_EVENT_TYPES = new Set([
  ...TOOL_APPROVAL_REQUEST_EVENT_TYPES,
  ...TOOL_APPROVAL_RESPONSE_EVENT_TYPES,
  'TOOL_CALL_ARGS',
  'TOOL_CALL_CHUNK',
  'TOOL_CALL_DENIED',
  'TOOL_CALL_END',
  'TOOL_CALL_ERROR',
  'TOOL_CALL_RESULT',
  'TOOL_CALL_START',
  'TOOL_OUTPUT_AVAILABLE',
  'TOOL_OUTPUT_DENIED',
  'TOOL_OUTPUT_ERROR',
]);
export const TOOL_CALL_RESULT_EVENT_TYPES = new Set(['TOOL_CALL_RESULT']);
export const TOOL_OUTPUT_AVAILABLE_EVENT_TYPES = new Set([
  'TOOL_CALL_RESULT',
  'TOOL_OUTPUT_AVAILABLE',
]);
export const TOOL_OUTPUT_DENIED_EVENT_TYPES = new Set([
  'TOOL_CALL_DENIED',
  'TOOL_OUTPUT_DENIED',
]);
export const TOOL_OUTPUT_ERROR_EVENT_TYPES = new Set([
  'TOOL_CALL_ERROR',
  'TOOL_OUTPUT_ERROR',
]);
export const ACTIVITY_EVENT_TYPES = new Set([
  'ACTIVITY_DELTA',
  'ACTIVITY_SNAPSHOT',
]);

export type ToolState =
  | 'approval-requested'
  | 'approval-responded'
  | 'input-available'
  | 'input-streaming'
  | 'output-available'
  | 'output-denied'
  | 'output-error';

export interface ToolEventGroup {
  events: AIChatEventMessageBlock[];
  id: string;
  key: string;
}

export type MessageEventRenderItem =
  | {
      event: AIChatEventMessageBlock;
      type: 'event';
    }
  | {
      group: ToolEventGroup;
      type: 'tool';
    };

const TOOL_STATE_VALUES = new Set<ToolState>([
  'approval-requested',
  'approval-responded',
  'input-available',
  'input-streaming',
  'output-available',
  'output-denied',
  'output-error',
]);

export function eventBlockHasAnyType(
  block: AIChatEventMessageBlock,
  eventTypes: Set<string>,
) {
  return [block.event_type, ...(block.event_types ?? [])].some((eventType) =>
    eventTypes.has(eventType),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getToolEventData(item: AIChatEventMessageBlock) {
  return isRecord(item.data) ? item.data : undefined;
}

function getToolEventStringField(item: AIChatEventMessageBlock, key: string) {
  const value = getToolEventData(item)?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

function getToolEventBooleanField(item: AIChatEventMessageBlock, key: string) {
  const value = getToolEventData(item)?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeToolStateValue(value: unknown): ToolState | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[_\s]+/gu, '-');
  if (TOOL_STATE_VALUES.has(normalized as ToolState)) {
    return normalized as ToolState;
  }

  switch (normalized) {
    case 'approved':
    case 'approval-response':
    case 'approval-responded':
    case 'tool-approval-response': {
      return 'approval-responded';
    }
    case 'approval-request':
    case 'approval-requested':
    case 'awaiting-approval':
    case 'tool-approval-request': {
      return 'approval-requested';
    }
    case 'denied':
    case 'rejected':
    case 'tool-output-denied': {
      return 'output-denied';
    }
    case 'error':
    case 'failed':
    case 'tool-output-error': {
      return 'output-error';
    }
    case 'completed':
    case 'success':
    case 'succeeded':
    case 'tool-output-available': {
      return 'output-available';
    }
    case 'input-ready':
    case 'running':
    case 'tool-input-available': {
      return 'input-available';
    }
    case 'input-delta':
    case 'input-stream':
    case 'pending':
    case 'streaming':
    case 'tool-input-start': {
      return 'input-streaming';
    }
  }
}

function getToolEventStateHint(item: AIChatEventMessageBlock) {
  const data = getToolEventData(item);
  const candidates = [
    item.event_type,
    ...(item.event_types ?? []),
    data?.type,
    data?.eventType,
    data?.state,
    data?.status,
    data?.toolState,
    data?.tool_state,
  ];

  for (const candidate of candidates) {
    const state = normalizeToolStateValue(candidate);
    if (state) {
      return state;
    }
  }
}

export function getToolErrorText(item: AIChatEventMessageBlock) {
  const data = getToolEventData(item);
  const stateHint = getToolEventStateHint(item);
  const isExplicitError =
    item.status === 'error' ||
    eventBlockHasAnyType(item, TOOL_OUTPUT_ERROR_EVENT_TYPES) ||
    stateHint === 'output-error';
  const candidates = [
    item.status === 'error' ? item.text : undefined,
    data?.error,
    data?.errorText,
    data?.error_text,
    isExplicitError ? data?.message : undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (isRecord(candidate)) {
      const message = candidate.message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    }
  }

  return item.status === 'error' ? item.title : '';
}

export function hasToolError(item: AIChatEventMessageBlock) {
  return (
    item.status === 'error' ||
    eventBlockHasAnyType(item, TOOL_OUTPUT_ERROR_EVENT_TYPES) ||
    getToolEventStateHint(item) === 'output-error' ||
    Boolean(getToolErrorText(item))
  );
}

function parseToolCallIdFromEventKey(eventKey: string) {
  const patterns = [
    /^tool-call:(.+?)(?::(?:args|start))?$/u,
    /^tool-result:(.+)$/u,
    /^tool-(?:approval|output):(.+?)(?::[\w-]+)?$/u,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(eventKey);
    if (match?.[1]) {
      return match[1];
    }
  }
}

function getToolCallId(item: AIChatEventMessageBlock) {
  return (
    getToolEventStringField(item, 'toolCallId') ??
    getToolEventStringField(item, 'tool_call_id') ??
    parseToolCallIdFromEventKey(item.event_key)
  );
}

function getToolEventGroupKey(item: AIChatEventMessageBlock) {
  const toolCallId = getToolCallId(item);
  return toolCallId ? `tool-call:${toolCallId}` : item.event_key;
}

export function getToolEventDisplayName(item: AIChatEventMessageBlock) {
  return (
    getToolEventStringField(item, 'toolCallName') ||
    getToolEventStringField(item, 'toolName') ||
    getToolEventStringField(item, 'tool_name') ||
    item.summary ||
    getToolCallId(item) ||
    item.title ||
    '工具调用'
  );
}

export function createToolEventGroup(
  item: AIChatEventMessageBlock,
): ToolEventGroup {
  return {
    events: [],
    id: getToolCallId(item) ?? item.event_key,
    key: getToolEventGroupKey(item),
  };
}

export function isToolEventBlock(item: AIChatEventMessageBlock) {
  return (
    eventBlockHasAnyType(item, TOOL_CALL_EVENT_TYPES) ||
    (Boolean(getToolCallId(item)) && Boolean(getToolEventStateHint(item)))
  );
}

export function createMessageEventRenderItems(
  events: AIChatEventMessageBlock[],
) {
  const items: MessageEventRenderItem[] = [];

  for (const event of events) {
    if (!isToolEventBlock(event)) {
      items.push({ event, type: 'event' });
      continue;
    }

    const groupKey = getToolEventGroupKey(event);
    const previousItem = items.at(-1);
    let group =
      previousItem?.type === 'tool' && previousItem.group.key === groupKey
        ? previousItem.group
        : undefined;
    if (!group) {
      group = createToolEventGroup(event);
      items.push({ group, type: 'tool' });
    }
    group.events.push(event);
  }

  return items;
}

function toolGroupHasAnyType(group: ToolEventGroup, types: Set<string>) {
  return group.events.some((event) => eventBlockHasAnyType(event, types));
}

function getLatestToolEvent(
  group: ToolEventGroup,
  predicate: (event: AIChatEventMessageBlock) => boolean,
) {
  for (let index = group.events.length - 1; index >= 0; index -= 1) {
    const event = group.events[index];
    if (event && predicate(event)) {
      return event;
    }
  }
}

export function getLatestToolEventByType(
  group: ToolEventGroup,
  types: Set<string>,
) {
  return getLatestToolEvent(group, (event) =>
    eventBlockHasAnyType(event, types),
  );
}

export function getToolGroupState(group: ToolEventGroup): ToolState {
  if (group.events.some((event) => hasToolError(event))) {
    return 'output-error';
  }

  if (
    group.events.some(
      (event) =>
        event.status === 'abort' ||
        eventBlockHasAnyType(event, TOOL_OUTPUT_DENIED_EVENT_TYPES) ||
        getToolEventBooleanField(event, 'approved') === false ||
        getToolEventStateHint(event) === 'output-denied',
    )
  ) {
    return 'output-denied';
  }

  if (
    toolGroupHasAnyType(group, TOOL_OUTPUT_AVAILABLE_EVENT_TYPES) ||
    group.events.some(
      (event) => getToolEventStateHint(event) === 'output-available',
    )
  ) {
    return 'output-available';
  }

  if (
    group.events.some(
      (event) =>
        eventBlockHasAnyType(event, TOOL_APPROVAL_RESPONSE_EVENT_TYPES) ||
        getToolEventBooleanField(event, 'approved') !== undefined ||
        getToolEventStateHint(event) === 'approval-responded',
    )
  ) {
    return 'approval-responded';
  }

  if (
    group.events.some(
      (event) =>
        eventBlockHasAnyType(event, TOOL_APPROVAL_REQUEST_EVENT_TYPES) ||
        getToolEventStateHint(event) === 'approval-requested',
    )
  ) {
    return 'approval-requested';
  }

  if (toolGroupHasAnyType(group, TOOL_CALL_END_EVENT_TYPES)) {
    return 'input-available';
  }

  const latestInputEvent = getLatestToolEventByType(
    group,
    TOOL_CALL_ARG_EVENT_TYPES,
  );
  if (latestInputEvent && latestInputEvent.status !== 'running') {
    return 'input-available';
  }

  if (
    group.events.some(
      (event) => getToolEventStateHint(event) === 'input-available',
    )
  ) {
    return 'input-available';
  }

  return 'input-streaming';
}

export function getToolPayload(item: AIChatEventMessageBlock) {
  const text = item.text?.trim();
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return item.data;
}

export function hasToolPayload(payload: unknown) {
  return (
    payload !== undefined &&
    payload !== null &&
    !(typeof payload === 'string' && payload.trim() === '')
  );
}
