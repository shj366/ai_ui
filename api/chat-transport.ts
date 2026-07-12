import type { AIChatTransportRequest } from './chat';

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
