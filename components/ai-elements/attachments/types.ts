import type { FileUIPart, SourceDocumentUIPart } from 'ai';

export type AttachmentData =
  | (FileUIPart & { id: string })
  | (SourceDocumentUIPart & { id: string });

export type AttachmentMediaCategory =
  | 'audio'
  | 'document'
  | 'image'
  | 'source'
  | 'unknown'
  | 'video';

export type AttachmentVariant = 'grid' | 'inline' | 'list';
