# AI Plugin

`ai` 插件为系统提供 AI 相关能力。

## 功能概览

- AI Chat：基于 `@antdv-next/x` 与 `@antdv-next/x-markdown` 构建对话界面，支持流式对话、Markdown 展示、代码高亮与 Mermaid 图表渲染
- Topic & History：管理会话话题、聊天历史与消息上下文
- Quick Phrase：管理快捷短语并在对话时快速复用
- Provider：管理 AI 供应商配置
- Model：管理供应商下可用模型
- MCP：管理可接入的 MCP 服务

## 依赖说明

这个仓库是 `pnpm workspace` monorepo，并统一使用 `catalog:` 管理依赖来源

如果缺少相关依赖，需要手动 `apps/web-antdv-next/package.json` 中添加：

```json
{
  "dependencies": {
    "@ag-ui/core": "catalog:",
    "@antdv-next/x": "catalog:",
    "@antdv-next/x-markdown": "catalog:"
  }
}
```

在根目录 `pnpm-workspace.yaml` 的 `catalog` 中添加：

```yaml
catalog:
  '@ag-ui/core': ^0.0.53
  '@antdv-next/x': ^1.0.2
  '@antdv-next/x-markdown': ^0.1.0
```
