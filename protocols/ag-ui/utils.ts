export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getRecordValue(record: unknown, ...keys: string[]) {
  if (!isRecord(record)) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function resolveTimestamp(
  value?: number | string,
  fallback = new Date().toISOString(),
) {
  if (value === undefined) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toISOString();
}

export function getEventText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function resolveMetadataFilename(metadata: unknown) {
  if (typeof metadata === 'string') {
    return metadata.trim() || null;
  }

  if (isRecord(metadata) && typeof metadata.filename === 'string') {
    return metadata.filename.trim() || null;
  }

  return null;
}

export function parseDataUrl(url: string) {
  const match = /^data:([^;,]+)?;base64,(.+)$/u.exec(url);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1] ?? 'application/octet-stream',
    value: match[2] ?? '',
  };
}
