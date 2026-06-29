<div align="center">
  <h1>智研搜 · 多智能体研搜平台</h1>
  <p><em>基于 LangGraph/deepagents 的对话式研究助手 · 一主三从协同 · WebSocket 实时推进</em></p>
</div>

<div align="center">

![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-WebSocket-009688?logo=fastapi&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-DeepAgents-1C3C3C)

</div>

---

## 项目简介

「智研搜」是一个多智能体协同的研搜系统。用户提出研究任务后，主智能体自动判断信息来源，调度 **网络搜索**、**数据库查询**、**RAGFlow 知识库** 三个子智能体协作获取资料，并在需要时读取上传附件、生成 Markdown/PDF 报告。执行过程通过 WebSocket 实时推送到前端对话界面。

**核心功能**

- 🤖 **多智能体协同**：主 Agent 调度 + 网络搜索 / 数据库查询 / 知识库检索 三个子 Agent
- 🌐 **联网检索**：Tavily API 实时获取公开资料
- 📊 **自然语言查数据库**：LLM 自动发现表结构 → 预览样例 → 生成并执行 SQL
- 📄 **知识库问答**：RAGFlow 私有文档检索与问答
- 📝 **文件交付**：自动生成 Markdown 报告，可一键转 PDF
- 💾 **历史会话持久化**：前端 localStorage 自动保存对话，刷新不丢失
- ⚡ **实时进度推送**：工具调用、子 Agent 调度、最终答案均通过 WebSocket 流式展示

---

## 系统架构

### 总体分层

```
┌──────────────────────────────────────────────────────────────┐
│  前端（React + Vite + Ant Design）                            │
│  对话输入 · 工具事件流 · 文件下载 · localStorage 会话持久化     │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTP（命令）+ WebSocket（进度）
┌────────────────────────────▼─────────────────────────────────┐
│  后端 API（FastAPI）                                          │
│  ├── POST /api/task             → 创建 session_dir 并提交任务 │
│  ├── POST /api/upload           → 文件存到 updated/{thread}   │
│  ├── GET  /api/files            → 列出 output/{thread} 文件   │
│  ├── GET  /api/download         → 安全下载生成文件            │
│  └── WS   /ws/{thread_id}       → 实时推送事件与结果          │
│                                                               │
│  ├── context.py（ContextVar） → 线程级隔离 thread_id / dir    │
│  └── monitor.py（ToolMonitor）→ 聚合 tool / assistant / result│
└────────────────────────────┬─────────────────────────────────┘
                             │ Python 函数调用
┌────────────────────────────▼─────────────────────────────────┐
│  智能体调度层（DeepAgents + LangGraph）                        │
│  main_agent.py                                                │
│    ├── create_deep_agent(worker=子智能体字典, tools=文件工具)  │
│    └── run_deep_agent → 异步 astream 事件流                    │
│                                                               │
│  ┌─ 网络搜索子 Agent ── Tavily internet_search                │
│  ├─ 数据库查询子 Agent ── 查表 → 预览结构 → 生成 SQL → 执行     │
│  └─ RAGFlow 知识库子 Agent ── 助手列表 → 临时会话问答           │
│                                                               │
│  主 Agent 持有的文件工具：                                     │
│    ├── read_file_content（读取上传附件）                       │
│    ├── generate_markdown（总结信息生成报告）                   │
│    └── convert_md_to_pdf（Markdown 转 PDF）                    │
└──────────────────────────────────────────────────────────────┘
```

### 典型数据流（一次完整任务）

```
① 用户在前端输入任务 + 上传附件（可选）
   │
   ├── HTTP POST /api/upload ──→ 文件落盘 updated/{thread_id}/
   └── HTTP POST /api/task  ──→ 后端创建 session_dir
                                提交任务到 asyncio.create_task
                                立即返回 202 Accepted
                                │
② 后端后台协程调用 run_deep_agent(query, files, ...)
   │
   ├─ 主 Agent 理解任务，判断信息缺口
   ├─ 调度网络搜索子 Agent → 查询公开资料
   ├─ 或调度数据库查询子 Agent → 发现表→预览结构→生成 SQL→执行
   ├─ 或调度 RAGFlow 知识库子 Agent → 查找内部文档
   ├─ 或读取用户上传文件 → 提取内容
   │
③ 每个工具/子 Agent 调用时，monitor.py 上报事件：
   ├── tool_start / tool_end
   ├── assistant_call
   ├── task_result / error
   │ 通过 WebSocket /ws/{thread_id} 实时推给前端
   │
④ 信息收集完毕后，主 Agent 调用 generate_markdown：
   ├─ 将对话历史整理为结构化 Markdown
   ├─ 写入 output/{session_dir}/report.md
   └─ 可选：convert_md_to_pdf 生成 PDF
   │
⑤ 前端接收 WebSocket 事件，渲染工具执行流和最终答案。
   用户可在"文件"区域下载 Markdown / PDF。
```

### 核心组件职责

| 组件 | 文件 | 职责 |
|------|------|------|
| **会话入口** | `app/api/server.py` | FastAPI 生命周期 + 路由定义 + WebSocket 连接管理 |
| **会话上下文** | `app/api/context.py` | `ContextVar` 保存当前 thread_id 和 session_dir，深层工具无需层层传参 |
| **事件上报** | `app/api/monitor.py` | 订阅 DeepAgents 事件流，整理后推送到对应用户的 WebSocket |
| **主智能体** | `app/agent/main_agent.py` | 组装 create_deep_agent，定义子智能体字典和文件工具集，暴露 `run_deep_agent` |
| **子智能体** | `app/agent/subagents/` | 每个子智能体持有自己的 LLM、工具和提示词，只负责一类信息来源 |
| **工具层** | `app/tools/` | Tavily 搜索、MySQL 查询、RAGFlow 会话、Markdown/PDF 生成的底层实现 |
| **提示词** | `app/prompt/prompts.yml` | 主/子智能体的 system prompt 与指令配置 |

### 数据库查询子 Agent 链路

这是最能体现"智能而非裸调用"的部分：

```
用户问："帮我查一下最近一个季度心血管药品的库存情况"
  │
  ├─ 1. list_sql_tables  → 返回所有表名
  ├─ 2. get_table_data  → 预览库存表前 5 行，理解字段含义
  ├─ 3. LLM 根据表结构生成 SQL（带参数绑定占位符）
  └─ 4. execute_sql_query → 执行并返回结果集
                              ↑
                         全程经过 monitor.py 上报
```

### 会话隔离设计

- 每个任务分配唯一 `thread_id`（UUID）
- 上传文件目录：`updated/{thread_id}/`
- 输出文件目录：`output/{session_dir}/`
- `context.py` 用 `ContextVar` 在线程/协程级绑定这两个 ID，深层工具无需显式传入
- 前端 `sessionStore.ts` 用 localStorage 按 thread_id 持久化 turns / events，实现刷新恢复和多会话切换

### 项目结构

```text
deepsearch-agents/
│
├── app/                                    ── Python 后端核心
│   ├── agent/                            智能体组装
│   │   ├── subagents/                    三个子智能体（各有独立 LLM + 工具）
│   │   │   ├── network_search_agent.py     网络搜索子 Agent（Tavily）
│   │   │   ├── database_query_agent.py     数据库查询子 Agent（MySQL）
│   │   │   └── knowledge_base_agent.py    RAGFlow 知识库子 Agent
│   │   ├── llm.py                        模型初始化（OpenAI 兼容）
│   │   ├── main_agent.py                 主 Agent：组装 + run_deep_agent
│   │   └── prompts.py                      从 prompts.yml 加载提示词
│   ├── api/                              FastAPI 层
│   │   ├── server.py                     路由：task / upload / files / download / ws
│   │   ├── context.py                     ContextVar：thread_id / session_dir
│   │   └── monitor.py                    ToolMonitor：事件聚合→WebSocket
│   ├── tools/                            工具层（主 Agent 和子 Agent 调用）
│   │   ├── tavily_tool.py               联网搜索
│   │   ├── db_tools.py                    list_sql_tables / get_table_data / execute_sql_query
│   │   ├── ragflow_tools.py               知识库助手列表 + 临时会话问答
│   │   ├── upload_file_read_tool.py          读取用户上传文件（PDF/Word/Excel/MD）
│   │   ├── markdown_tools.py                generate_markdown 生成报告
│   │   └── pdf_tools.py                     convert_md_to_pdf 转 PDF
│   ├── utils/                             工具函数
│   │   ├── path_utils.py                   路径安全解析（防越权下载）
│   │   └── word_converter.py                 .docx 转纯文本
│   ├── prompt/prompts.yml                 主/子 Agent 的 system prompt 配置
│   └── ragflow/                          RAGFlow 调试示例（可选使用）
│
├── docker/                               Docker 部署辅助
│   ├── docker-compose.yaml               MySQL 8.4 容器（含 healthcheck）
│   └── mysql/mysql.sql                   模拟数据：药品/库存/销售记录
│
├── frontend/                              React + Vite 前端
│   └── src/
│       ├── App.tsx                        主界面：侧边栏会话列表 + 对话区
│       ├── main.tsx                       入口
│       ├── types.ts                        TypeScript 类型定义
│       ├── styles.css                      全局样式
│       ├── hooks/
│       │   └── useDeepAgentSession.ts         会话状态 Hook：管理 turns/events/files + WebSocket
│       ├── lib/
│       │   ├── api.ts                        HTTP 请求封装（task/upload/files/download）
│       │   ├── config.ts                    API / WS 地址配置（读取 .env）
│       │   ├── thread.ts                    thread_id 生成与 localStorage 存储
│       │   └── sessionStore.ts            多会话持久化：localStorage 读写/恢复
│       └── components/                     UI 组件
│           ├── ConversationThread.tsx          对话历史 + 事件流折叠面板
│           ├── ChatComposer.tsx            任务输入框
│           ├── EventStream.tsx               工具/子 Agent 调用事件列表
│           ├── UploadPanel.tsx             文件上传面板
│           ├── FileDock.tsx                 已上传文件 + 生成文件下载
│           ├── ResultPanel.tsx              Markdown 结果渲染区
│           ├── MarkdownRenderer.tsx        安全的 Markdown 渲染器
│           ├── StatusStrip.tsx               连接/模型状态条
│           ├── MissionComposer.tsx          任务配置面板（可选）
│           └── AgentTopology.tsx           智能体架构示意图
│
├── examples/                            DeepAgents 框架入门示例脚本
├── docs/knowledge_base/                 RAGFlow 示例 PDF（电商/金融）
├── .env.example                        环境变量模板（API Key / 数据库配置）
├── pyproject.toml                      Python 项目配置与依赖声明
└── README.md
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 智能体框架 | DeepAgents / LangGraph / LangChain |
| 大模型 | OpenAI 兼容接口（DashScope / DeepSeek / Ollama）|
| 网络搜索 | Tavily API |
| 结构化数据 | MySQL + mysql-connector-python |
| 私有知识库 | RAGFlow |
| 文件处理 | pypdf / python-docx / pandas / ReportLab |
| 后端 | FastAPI + Uvicorn + WebSocket |
| 前端 | React + TypeScript + Vite + Ant Design |
| 会话上下文 | ContextVar + thread_id + session_dir 隔离 |
| 历史会话 | 前端 localStorage |
| 依赖管理 | uv (Python) / npm (Frontend) |

---

## 快速开始

### 1. 准备环境

- Python 3.11+
- Node.js 18+
- Docker Desktop（用于本地 MySQL 教学库）
- 大模型 API Key（OpenAI 兼容接口）
- Tavily API Key（可选，用于联网搜索）
- RAGFlow 服务与 API Key（可选，用于私有知识库）

### 2. 克隆项目

```bash
git clone [https://github.com/tudou718/deepsearch-agents-learning.git](https://github.com/tudou718/deepsearch-agents-learning.git)
cd deepsearch-agents-learning

### 3. 安装后端依赖

```bash
uv sync
```

### 4. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的密钥和服务地址：

```bash
# LLM
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_API_KEY=你的_API_KEY
LLM_QWEN_MAX=qwen-max

# 网络搜索（可选）
TAVILY_API_KEY=你的_TAVILY_API_KEY

# RAGFlow 私有知识库（可选）
RAGFLOW_API_URL=http://your-ragflow-host
RAGFLOW_API_KEY=ragflow-your-api-key

# MySQL
MYSQL_USER=root
MYSQL_PASSWORD=root
MYSQL_DATABASE=deepsearch_db
MYSQL_HOST=localhost
MYSQL_PORT=3306
```

### 5. 启动 MySQL 教学库

```bash
docker compose -f docker/docker-compose.yaml up -d
```

首次启动时 `docker/mysql/mysql.sql` 会自动导入药品、库存和销售记录模拟数据。

### 6. 启动后端

```bash
uv run uvicorn app.api.server:app --host 0.0.0.0 --port 8000 --reload
```

### 7. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认访问：**http://localhost:5173**

### 8. 试试几个任务

```text
从数据库中查询心血管药品的库存情况，并生成 Markdown 报告。
```

```text
搜索 2026 年 AI 在电商行业的应用趋势，并结合知识库资料生成 PDF。
```

```text
请先读取我上传的行业报告，再结合公开资料整理一份研究摘要。
```

---

## 能力边界

当前版本专注于**多智能体调度、真实工具接入、文件交付、前后端实时闭环**。以下生产治理能力未实现，可在此基础上扩展：

- 用户登录、角色权限、多租户隔离
- 任务队列、分布式执行、大规模并发治理
- 全量事件持久化和审计追踪（目前前端仅用 localStorage 持久化）
- 自动化评测与 Agent 质量评估
- 生产级监控、告警、灰度发布

---

## License

本项目仅用于个人学习与研究，请勿用于商业用途。
