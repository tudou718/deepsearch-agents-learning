import {
  ApiOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  MessageOutlined,
  ToolOutlined
} from "@ant-design/icons";
import { Alert, App as AntApp, Button, Tooltip } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatComposer } from "./components/ChatComposer";
import { ConversationThread } from "./components/ConversationThread";
import type { ChatTurn } from "./components/ConversationThread";
import { API_BASE_URL, WS_BASE_URL } from "./lib/config";
import { useDeepAgentSession } from "./hooks/useDeepAgentSession";
import type { ConnectionState, UploadedItem } from "./types";

function connectionLabel(state: ConnectionState): string {
  const labels: Record<ConnectionState, string> = {
    connecting: "连接中",
    connected: "已连接",
    reconnecting: "重连中",
    closed: "已关闭"
  };
  return labels[state];
}

function createTurn(content: string): ChatTurn {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
    content,
    events: [],
    files: [],
    isRunning: true,
    result: "",
    timestamp: new Date().toISOString()
  };
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isSameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (isSameDay) {
    return `${hh}:${mm}`;
  }
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}-${day} ${hh}:${mm}`;
}

export default function App() {
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState("");
  const [stagedItems, setStagedItems] = useState<UploadedItem[]>([]);
  const streamRef = useRef<HTMLElement | null>(null);
  const session = useDeepAgentSession();

  // 将 session 最新的 events/files/isRunning/result 同步到当前最新的 turn
  useEffect(() => {
    if (session.turns.length === 0) {
      return;
    }
    const latest = session.turns[session.turns.length - 1];
    const needUpdate =
      latest.events !== session.events ||
      latest.files !== session.files ||
      latest.isRunning !== session.isRunning ||
      latest.result !== session.result;
    if (needUpdate) {
      session.setLatestTurnResult({
        events: session.events,
        files: session.files,
        isRunning: session.isRunning,
        result: session.result
      });
    }
  }, [session.events, session.files, session.isRunning, session.result, session.turns.length, session]);

  // 对话滚动到底部
  useEffect(() => {
    const streamNode = streamRef.current;
    if (!streamNode) {
      return;
    }

    window.requestAnimationFrame(() => {
      streamNode.scrollTo({
        top: streamNode.scrollHeight,
        behavior: "smooth"
      });
    });
  }, [session.turns.length, session.result]);

  async function handleSubmit() {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      message.warning("请输入研搜任务");
      return;
    }

    const nextTurn = createTurn(cleanQuery);
    session.appendTurn(nextTurn);
    setQuery("");

    try {
      await session.submitTask(cleanQuery);
      message.success("任务已启动，执行过程会显示在对话中");
    } catch (error) {
      session.setLatestTurnResult({
        isRunning: false,
        result: error instanceof Error ? error.message : "任务启动失败"
      });
      message.error(error instanceof Error ? error.message : "任务启动失败");
    }
  }

  async function handleCancel() {
    try {
      const response = await session.cancelCurrentTask();
      message.info(response.status === "cancelling" ? "取消请求已发送，正在等待当前调用结束" : "任务已取消");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "取消任务失败");
    }
  }

  async function handleUpload(items: UploadedItem[]) {
    try {
      const response = await session.uploadFiles(items);
      setStagedItems([]);
      message.success(`已上传 ${response.files.length} 个文件`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "上传失败");
    }
  }

  function handleNewSession() {
    setQuery("");
    setStagedItems([]);
    session.createNewSession();
  }

  function handleSwitchSession(threadId: string) {
    if (session.isRunning) {
      message.warning("当前会话仍在执行，请等待完成或取消后再切换");
      return;
    }
    setQuery("");
    setStagedItems([]);
    session.switchSession(threadId);
  }

  function handleDeleteSession(threadId: string, e: React.MouseEvent) {
    e.stopPropagation();
    session.deleteSession(threadId);
    message.info("已删除该会话");
  }

  const online = session.connectionState === "connected";

  const sortedSessions = useMemo(() => {
    return [...session.sessionList].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [session.sessionList]);

  return (
    <div className="chat-app-shell min-h-dvh">
      <aside className="chat-sidebar" aria-label="会话信息">
        <div className="sidebar-brand">
          <span className="panel-kicker">DEEPSEARCH</span>
          <h1>智研搜</h1>
          <p>对话式多智能体研究台</p>
        </div>

        <Button className="new-chat-button" block type="primary" onClick={handleNewSession}>
          <MessageOutlined /> 新建研搜
        </Button>

        <div className="sidebar-section">
          <span className="sidebar-label">
            <HistoryOutlined /> 历史会话
          </span>
          <div className="session-list">
            {sortedSessions.length === 0 ? (
              <span className="session-empty">暂无历史会话</span>
            ) : (
              sortedSessions.map((s) => (
                <div
                  key={s.threadId}
                  className={`session-item ${s.threadId === session.threadId ? "session-item--active" : ""}`}
                  onClick={() => handleSwitchSession(s.threadId)}
                  title={s.title}
                >
                  <span className="session-item-title">{s.title}</span>
                  <span className="session-item-meta">
                    <span>{s.turnCount} 轮 · {formatTimestamp(s.updatedAt)}</span>
                    <Tooltip title="删除此会话">
                      <DeleteOutlined
                        className="session-item-delete"
                        onClick={(e) => handleDeleteSession(s.threadId, e)}
                      />
                    </Tooltip>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">THREAD</span>
          <strong className="thread-id" title={session.threadId}>
            {session.threadId.slice(0, 8)}
          </strong>
        </div>

        <div className="sidebar-status-list">
          <div className={`sidebar-status ${online ? "sidebar-status--online" : "sidebar-status--warn"}`}>
            <ApiOutlined aria-hidden />
            <span>WebSocket</span>
            <strong>{connectionLabel(session.connectionState)}</strong>
          </div>
          <div className="sidebar-status">
            <BranchesOutlined aria-hidden />
            <span>助手调度</span>
            <strong>{session.stats.assistantEvents}</strong>
          </div>
          <div className="sidebar-status">
            <ToolOutlined aria-hidden />
            <span>工具调用</span>
            <strong>{session.stats.toolEvents}</strong>
          </div>
          <div className={session.stats.errorEvents > 0 ? "sidebar-status sidebar-status--error" : "sidebar-status"}>
            <CheckCircleOutlined aria-hidden />
            <span>异常</span>
            <strong>{session.stats.errorEvents}</strong>
          </div>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">AGENTS</span>
          <ul className="agent-mini-list">
            <li>
              <CloudServerOutlined aria-hidden />
              网络搜索助手
            </li>
            <li>
              <DatabaseOutlined aria-hidden />
              数据库查询助手
            </li>
            <li>
              <FileSearchOutlined aria-hidden />
              RAGFlow 助手
            </li>
          </ul>
        </div>

        <div className="sidebar-section sidebar-endpoints">
          <span className="sidebar-label">ENDPOINTS</span>
          <code>{API_BASE_URL}</code>
          <code>{WS_BASE_URL}</code>
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-topbar">
          <div>
            <span className="panel-kicker">CHAT WORKSPACE</span>
            <h2>智研搜对话</h2>
          </div>
          <div className={`run-indicator ${session.isRunning ? "run-indicator--live" : ""}`}>
            {session.isRunning ? <BranchesOutlined aria-hidden /> : <CheckCircleOutlined aria-hidden />}
            {session.isRunning ? "研搜中" : "待命"}
          </div>
        </header>

        {session.lastError ? (
          <Alert
            className="chat-alert"
            message={session.lastError}
            showIcon
            type="error"
          />
        ) : null}

        <section className="chat-stream-panel" ref={streamRef}>
          <ConversationThread
            onUseExample={setQuery}
            turns={session.turns}
          />
        </section>

        <ChatComposer
          isCancelling={session.isCancelling}
          isRunning={session.isRunning}
          isUploading={session.isUploading}
          onCancel={handleCancel}
          onNewSession={handleNewSession}
          onQueryChange={setQuery}
          onStagedItemsChange={setStagedItems}
          onSubmit={handleSubmit}
          onUpload={handleUpload}
          query={query}
          stagedItems={stagedItems}
          uploadedItems={session.uploadedItems}
        />
      </main>
    </div>
  );
}
