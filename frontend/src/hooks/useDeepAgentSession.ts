import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelTask, listSessionFiles, startTask, uploadSessionFiles } from "../lib/api";
import { WS_BASE_URL } from "../lib/config";
import {
  createEmptySession,
  deleteSession as deleteStoredSession,
  ensureSession,
  listSessions,
  loadSession,
  markActive,
  saveSession,
  toStoredUploadedFiles,
  type SessionSummary
} from "../lib/sessionStore";
import type {
  ConnectionState,
  MonitorMessage,
  OutputFile,
  SocketMessage,
  UploadedItem
} from "../types";
import type { ChatTurn } from "../components/ConversationThread";

const MAX_EVENTS = 120;

function extractString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" ? value : null;
}

function sessionTitleFromTurns(turns: ChatTurn[]): string {
  if (turns.length === 0) {
    return "新会话";
  }
  const firstQuery = turns[0].content.trim();
  if (firstQuery.length === 0) {
    return "新会话";
  }
  return firstQuery.length > 20 ? `${firstQuery.slice(0, 20)}…` : firstQuery;
}

export function useDeepAgentSession() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const heartbeatTimerRef = useRef<number | undefined>(undefined);
  const uploadedNameSetRef = useRef<Set<string>>(new Set());

  const initial = useMemo(() => ensureSession(), []);

  const [threadId, setThreadId] = useState(initial.threadId);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [events, setEvents] = useState<MonitorMessage[]>(initial.events);
  const [files, setFiles] = useState<OutputFile[]>(initial.files);
  const [sessionPath, setSessionPath] = useState(initial.sessionPath);
  const [result, setResult] = useState(initial.result);
  const [lastError, setLastError] = useState("");
  const [lastPongAt, setLastPongAt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedItems, setUploadedItems] = useState<UploadedItem[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>(initial.turns);
  const [sessionList, setSessionList] = useState<SessionSummary[]>(() => listSessions());

  // 初始化已上传文件名集合，避免重复上传
  useEffect(() => {
    uploadedNameSetRef.current = new Set(
      initial.uploadedFiles.map((f) => f.name).concat(uploadedItems.map((i) => i.name))
    );
  }, []);

  const refreshSessionList = useCallback(() => {
    setSessionList(listSessions());
  }, []);

  const persist = useCallback(
    (patch: Partial<{
      turns: ChatTurn[];
      events: MonitorMessage[];
      files: OutputFile[];
      result: string;
      sessionPath: string;
      uploadedItems: UploadedItem[];
    }>) => {
      const currentTurns = patch.turns ?? turns;
      const currentEvents = patch.events ?? events;
      const currentFiles = patch.files ?? files;
      const currentResult = patch.result ?? result;
      const currentPath = patch.sessionPath ?? sessionPath;
      const currentUploaded = patch.uploadedItems ?? uploadedItems;

      saveSession({
        threadId,
        title: sessionTitleFromTurns(currentTurns),
        createdAt: initial.createdAt,
        updatedAt: Date.now(),
        turns: currentTurns,
        events: currentEvents,
        files: currentFiles,
        result: currentResult,
        sessionPath: currentPath,
        uploadedFiles: toStoredUploadedFiles(currentUploaded)
      });
    },
    [threadId, turns, events, files, result, sessionPath, uploadedItems, initial.createdAt]
  );

  // 自动持久化：turns / events / files / result / sessionPath 变化时写入 localStorage
  useEffect(() => {
    persist({});
    refreshSessionList();
  }, [turns, events, files, result, sessionPath, persist, refreshSessionList]);

  const clearSocketTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = undefined;
    }
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = undefined;
    }
  }, []);

  const restoreFromThreadId = useCallback((newThreadId: string) => {
    const stored = loadSession(newThreadId);
    if (stored) {
      setTurns(stored.turns);
      setEvents(stored.events);
      setFiles(stored.files);
      setResult(stored.result);
      setSessionPath(stored.sessionPath);
      uploadedNameSetRef.current = new Set(stored.uploadedFiles.map((f) => f.name));
      setUploadedItems([]);
    } else {
      setTurns([]);
      setEvents([]);
      setFiles([]);
      setResult("");
      setSessionPath("");
      uploadedNameSetRef.current.clear();
      setUploadedItems([]);
    }
    setIsRunning(false);
    setIsCancelling(false);
    setLastError("");
  }, []);

  const createNewSession = useCallback(() => {
    const next = createEmptySession();
    setThreadId(next.threadId);
    setTurns([]);
    setEvents([]);
    setFiles([]);
    setSessionPath("");
    setResult("");
    setLastError("");
    setUploadedItems([]);
    uploadedNameSetRef.current.clear();
    setIsRunning(false);
    setIsCancelling(false);
    refreshSessionList();
  }, [refreshSessionList]);

  const switchSession = useCallback(
    (targetThreadId: string) => {
      if (targetThreadId === threadId) {
        return;
      }
      markActive(targetThreadId);
      setThreadId(targetThreadId);
      restoreFromThreadId(targetThreadId);
      refreshSessionList();
    },
    [threadId, restoreFromThreadId, refreshSessionList]
  );

  const deleteSession = useCallback(
    (targetThreadId: string) => {
      deleteStoredSession(targetThreadId);

      if (targetThreadId === threadId) {
        // 删除的是当前会话，切换到列表中另一个会话，或新建
        const remaining = listSessions().filter((s) => s.threadId !== targetThreadId);
        if (remaining.length > 0) {
          const next = remaining[0];
          markActive(next.threadId);
          setThreadId(next.threadId);
          restoreFromThreadId(next.threadId);
        } else {
          const next = createEmptySession();
          setThreadId(next.threadId);
          setTurns([]);
          setEvents([]);
          setFiles([]);
          setSessionPath("");
          setResult("");
          setUploadedItems([]);
          uploadedNameSetRef.current.clear();
          setIsRunning(false);
          setIsCancelling(false);
        }
      }

      refreshSessionList();
    },
    [threadId, restoreFromThreadId, refreshSessionList]
  );

  const resetSession = useCallback(() => {
    createNewSession();
  }, [createNewSession]);

  const refreshFiles = useCallback(async () => {
    if (!sessionPath) {
      return;
    }

    const response = await listSessionFiles(sessionPath);
    if (response.error) {
      throw new Error(response.error);
    }
    setFiles(response.files || []);
  }, [sessionPath]);

  useEffect(() => {
    let disposed = false;

    function connect() {
      clearSocketTimers();
      const hadSocket = Boolean(socketRef.current);
      socketRef.current?.close();
      setConnectionState(hadSocket ? "reconnecting" : "connecting");

      const socket = new WebSocket(`${WS_BASE_URL}/ws/${encodeURIComponent(threadId)}`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) {
          return;
        }
        setConnectionState("connected");
        setLastError("");
        heartbeatTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send("ping");
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        if (socketRef.current !== socket) {
          return;
        }
        try {
          const payload = JSON.parse(event.data) as SocketMessage;
          if (payload.type === "pong") {
            setLastPongAt(new Date().toISOString());
            return;
          }

          if (payload.type !== "monitor_event") {
            return;
          }

          setEvents((previous) => [...previous, payload].slice(-MAX_EVENTS));

          if (payload.event === "session_created") {
            const path = extractString(payload.data, "path");
            if (path) {
              setSessionPath(path);
            }
          }

          if (payload.event === "task_result") {
            const finalResult = extractString(payload.data, "result");
            setResult(finalResult || payload.message);
            setIsRunning(false);
            setIsCancelling(false);
          }

          if (payload.event === "task_cancelled") {
            setResult((previous) => previous || payload.message);
            setIsRunning(false);
            setIsCancelling(false);
          }

          if (payload.event === "error") {
            setLastError(payload.message);
            setIsRunning(false);
            setIsCancelling(false);
          }
        } catch (error) {
          setLastError(error instanceof Error ? error.message : "WebSocket 消息解析失败");
        }
      };

      socket.onerror = () => {
        if (!disposed && socketRef.current === socket) {
          setLastError("WebSocket 连接异常，请确认后端服务已启动");
        }
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) {
          return;
        }
        clearSocketTimers();
        if (disposed) {
          setConnectionState("closed");
          return;
        }
        setConnectionState("reconnecting");
        reconnectTimerRef.current = window.setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      disposed = true;
      clearSocketTimers();
      socketRef.current?.close();
    };
  }, [clearSocketTimers, threadId]);

  useEffect(() => {
    if (!sessionPath) {
      return;
    }

    refreshFiles().catch((error: unknown) => {
      setLastError(error instanceof Error ? error.message : "文件列表刷新失败");
    });

    const timer = window.setInterval(() => {
      refreshFiles().catch((error: unknown) => {
        setLastError(error instanceof Error ? error.message : "文件列表刷新失败");
      });
    }, isRunning ? 2500 : 6000);

    return () => window.clearInterval(timer);
  }, [isRunning, refreshFiles, sessionPath]);

  const appendTurn = useCallback((turn: ChatTurn) => {
    setTurns((previous) => [...previous, turn]);
  }, []);

  const setLatestTurnResult = useCallback(
    (patch: Partial<{ isRunning: boolean; result: string; events: MonitorMessage[]; files: OutputFile[] }>) => {
      setTurns((previous) => {
        if (previous.length === 0) {
          return previous;
        }
        const latest = previous[previous.length - 1];
        const nextLatest: ChatTurn = {
          ...latest,
          events: patch.events ?? latest.events,
          files: patch.files ?? latest.files,
          isRunning: patch.isRunning ?? latest.isRunning,
          result: patch.result ?? latest.result
        };
        return [...previous.slice(0, -1), nextLatest];
      });
    },
    []
  );

  const submitTask = useCallback(
    async (query: string) => {
      const cleanQuery = query.trim();
      if (!cleanQuery) {
        throw new Error("请输入研搜任务");
      }

      setIsRunning(true);
      setIsCancelling(false);
      setEvents([]);
      setResult("");
      setLastError("");
      try {
        const response = await startTask(cleanQuery, threadId);
        if (response.thread_id && response.thread_id !== threadId) {
          setThreadId(response.thread_id);
        }
        return response;
      } catch (error) {
        setIsRunning(false);
        setIsCancelling(false);
        throw error;
      }
    },
    [threadId]
  );

  const cancelCurrentTask = useCallback(async () => {
    if (!isRunning) {
      throw new Error("当前没有正在执行的任务");
    }

    setIsCancelling(true);
    setLastError("");
    try {
      const response = await cancelTask(threadId);
      if (response.status === "cancelled") {
        setIsRunning(false);
        setIsCancelling(false);
        setResult((previous) => previous || "任务已取消");
      }
      return response;
    } catch (error) {
      setIsCancelling(false);
      throw error;
    }
  }, [isRunning, threadId]);

  const uploadFiles = useCallback(
    async (items: UploadedItem[]) => {
      if (items.length === 0) {
        throw new Error("请选择要上传的文件");
      }

      const nextItems = items.filter((item) => !uploadedNameSetRef.current.has(item.name));

      if (nextItems.length === 0) {
        return {
          status: "uploaded",
          files: Array.from(uploadedNameSetRef.current)
        };
      }

      setIsUploading(true);
      setLastError("");
      try {
        const response = await uploadSessionFiles(
          nextItems.map((item) => item.raw),
          threadId
        );
        setUploadedItems((previous) => {
          const names = new Set(previous.map((item) => item.name));
          const next = [...previous];
          nextItems.forEach((item) => {
            if (!names.has(item.name)) {
              names.add(item.name);
              uploadedNameSetRef.current.add(item.name);
              next.push(item);
            }
          });
          return next;
        });
        return response;
      } finally {
        setIsUploading(false);
      }
    },
    [threadId]
  );

  const stats = useMemo(() => {
    const toolEvents = events.filter((event) => event.event === "tool_start").length;
    const assistantEvents = events.filter((event) => event.event === "assistant_call").length;
    const errorEvents = events.filter((event) => event.event === "error").length;

    return {
      toolEvents,
      assistantEvents,
      errorEvents,
      fileCount: files.length
    };
  }, [events, files.length]);

  return {
    connectionState,
    events,
    files,
    isCancelling,
    isRunning,
    isUploading,
    lastError,
    lastPongAt,
    refreshFiles,
    resetSession,
    result,
    sessionPath,
    stats,
    cancelCurrentTask,
    submitTask,
    threadId,
    uploadFiles,
    uploadedItems,
    turns,
    appendTurn,
    setLatestTurnResult,
    sessionList,
    switchSession,
    deleteSession,
    createNewSession,
    refreshSessionList
  };
}
