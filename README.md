# AI Plugin

`ai` 插件为系统提供 AI 相关能力。

## 功能概览

- AI Chat：基于 AI Elements Vue 本地组件构建对话界面，支持流式对话、Markdown 展示、代码块、来源、附件与推理过程渲染
- Topic & History：管理会话话题、聊天历史与消息上下文
- Quick Phrase：管理快捷短语并在对话时快速复用
- Provider：管理 AI 供应商配置
- Model：管理供应商下可用模型
- MCP：管理可接入的 MCP 服务

## AI 对话请求流程

```mermaid
flowchart TD
  A["用户点击发送"] --> B["前端组装请求<br/>prompt / 附件 / 模型参数"]
  B --> C["buildChatCompletionRequest<br/>转换为 AG-UI messages + forwardedProps"]
  C --> D["useAIChatStream 发起 POST 请求"]
  D --> E["后端返回 SSE / 流式 AG-UI Event"]

  E --> F{"事件类型"}
  F -->|"TEXT_MESSAGE_*"| G["转成 text block"]
  F -->|"REASONING_* / THINKING_*"| H["转成 reasoning block"]
  F -->|"TOOL_CALL_*"| I["转成 event block<br/>工具开始 / 参数 / 结果"]
  F -->|"工具结果含文件"| J["转成 file block"]
  F -->|"RUN / STEP / STATE"| K["转成生命周期 event block"]

  G --> L["mergeStreamMessage 合并流式消息"]
  H --> L
  I --> L
  J --> L
  K --> L

  L --> M["更新 transientMessages"]
  M --> N["displayMessages = 历史消息 + 临时消息"]
  N --> O["renderChatMessageContent 渲染"]

  O --> P{"渲染 block"}
  P -->|"text"| Q["Markdown 内容"]
  P -->|"reasoning"| R["思考折叠面板"]
  P -->|"event"| S["任务步骤 / 工具卡片"]
  P -->|"file"| T["图片 / 视频 / 附件"]

  E --> U{"流结束 / 报错 / 中止"}
  U -->|"成功"| V["commitSuccessfulTransientMessages<br/>临时消息写入 activeMessages"]
  U -->|"失败"| W["显示错误消息<br/>保留或恢复输入"]
  U -->|"中止"| X["停止流式状态"]

  V --> Y["同步会话元信息"]
  W --> Z["结束请求状态"]
  X --> Z
  Y --> Z["结束"]
```

简版链路：用户发送 -> 前端转 AG-UI 请求 -> 后端流式返回 AG-UI events -> 前端转 blocks -> 合并临时 assistant 消息 -> 渲染 text/reasoning/event/file -> 成功后提交到 activeMessages -> 结束
