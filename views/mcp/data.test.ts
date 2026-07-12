import { describe, expect, it } from 'vitest';

import { parseMcpImportJson } from './data';

describe('parseMcpImportJson', () => {
  it('applies the latest MCP defaults', () => {
    expect(
      parseMcpImportJson(
        JSON.stringify({
          mcpServers: {
            demo: { command: 'npx' },
          },
        }),
      ),
    ).toMatchObject({
      command: 'npx',
      include_instructions: false,
      name: 'demo',
      read_timeout: 300,
      timeout: 5,
      type: 0,
    });
  });

  it('accepts streamable HTTP aliases and structured fields', () => {
    expect(
      parseMcpImportJson(
        JSON.stringify({
          mcpServers: {
            remote: {
              headers: { Authorization: 'Bearer token' },
              includeInstructions: true,
              toolPrefix: 'remote',
              type: 'streamableHttp',
              url: 'https://example.com/mcp',
            },
          },
        }),
      ),
    ).toMatchObject({
      headers: { Authorization: 'Bearer token' },
      include_instructions: true,
      tool_prefix: 'remote',
      type: 2,
      url: 'https://example.com/mcp',
    });
  });

  it('rejects non-array command arguments', () => {
    expect(() =>
      parseMcpImportJson(
        JSON.stringify({
          mcpServers: {
            demo: { args: '--verbose', command: 'npx' },
          },
        }),
      ),
    ).toThrow('args 必须是字符串数组');
  });
});
