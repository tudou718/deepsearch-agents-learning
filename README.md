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

```
┌─────────────────────────────────────────────────────────┐
│  前端 (React + Vite + Ant Design)                       │
│  对话输入 · 事件流 · 文件下载 · 历史会话                  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP + WebSocket
┌────────────────────────▼────────────────────────────────┐
│  后端 (FastAPI)                                         │
│  POST /api/task · POST /api/upload · GET /api/files     │
│  GET /api/download · WS /ws/{thread_id}                 │
│  ToolMonitor 事件聚合 · ContextVar 会话隔离              │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  智能体层 (DeepAgents + LangGraph)                      │
│  主 Agent 路由调度                                       │
│    ├── 网络搜索子 Agent (Tavily)                         │
│    ├── 数据库查询子 Agent (MySQL: 查表→预览→执行 SQL)    │
│    └── RAGFlow 知识库子 Agent (文档问答)                 │
│  主 Agent 持有的文件工具：读取附件 / 生成 Markdown / PDF │
└─────────────────────────────────────────────────────────┘
```

### 项目结构

```text
deepsearch-agents/
├── app/
│   ├── agent/
│   │   ├── subagents/           # 网络搜索、数据库查询、RAGFlow 三个子智能体
│   │   ├── llm.py               # 模型初始化（OpenAI 兼容接口）
│   │   ├── main_agent.py        # 主智能体组装与 run_deep_agent 执行入口
│   │   └── prompts.py           # 从 app/prompt/prompts.yml 加载提示词
│   ├── api/
│   │   ├── context.py           # ContextVar 保存 thread_id 和 session_dir
│   │   ├── monitor.py           # 工具/子智能体调用事件统一上报
│   │   └── server.py            # FastAPI 任务/上传/文件/WebSocket 接口
│   ├── tools/                   # Tavily、MySQL、RAGFlow、Markdown、PDF 工具
│   ├── utils/                   # 路径安全解析、Markdown/PDF 底层转换
│   └── prompt/prompts.yml       # 主/子智能体提示词配置
├── docker/
│   ├── docker-compose.yaml      # MySQL 教学环境
│   └── mysql/mysql.sql          # 药品/库存/销售记录模拟数据
├── frontend/                    # React + Vite 前端项目
├── examples/                    # DeepAgents 章节示例脚本
├── .env.example                 # 环境变量示例
└── pyproject.toml
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
