import { createThreadId } from "./thread";
import type { ChatTurn } from "../components/ConversationThread";
import type { MonitorMessage, OutputFile, UploadedItem } from "../types";

const SESSIONS_KEY = "deepsearch.sessions.v1";
const ACTIVE_KEY = "deepsearch.active_thread.v1";
const MAX_SESSIONS = 30;

export interface StoredUploadedFile {
  uid: string;
  name: string;
  size: number;
}

export interface StoredSession {
  threadId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: ChatTurn[];
  events: MonitorMessage[];
  files: OutputFile[];
  result: string;
  sessionPath: string;
  uploadedFiles: StoredUploadedFile[];
}

export interface SessionSummary {
  threadId: string;
  title: string;
  updatedAt: number;
  turnCount: number;
}

function readAll(): Record<string, StoredSession> {
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, StoredSession>;
  } catch {
    return {};
  }
}

function writeAll(sessions: Record<string, StoredSession>): void {
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // 容量不足时静默失败（localStorage 通常 5MB 上限）
  }
}

export function getActiveThreadId(): string {
  return window.localStorage.getItem(ACTIVE_KEY) || "";
}

function setActiveThreadId(threadId: string): void {
  window.localStorage.setItem(ACTIVE_KEY, threadId);
}

export function listSessions(): SessionSummary[] {
  const sessions = readAll();
  const summaries: SessionSummary[] = Object.values(sessions).map((s) => ({
    threadId: s.threadId,
    title: s.title,
    updatedAt: s.updatedAt,
    turnCount: s.turns.length
  }));
  summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  return summaries;
}

export function loadSession(threadId: string): StoredSession | null {
  const sessions = readAll();
  return sessions[threadId] || null;
}

export function saveSession(session: StoredSession): void {
  const sessions = readAll();
  sessions[session.threadId] = session;

  // 超过最大数量时，删除最旧的会话
  const keys = Object.keys(sessions);
  if (keys.length > MAX_SESSIONS) {
    const sorted = keys
      .map((k) => ({ id: k, updatedAt: sessions[k].updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    for (let i = MAX_SESSIONS; i < sorted.length; i++) {
      delete sessions[sorted[i].id];
    }
  }

  writeAll(sessions);
}

export function deleteSession(threadId: string): void {
  const sessions = readAll();
  delete sessions[threadId];
  writeAll(sessions);
}

export function clearAllSessions(): void {
  window.localStorage.removeItem(SESSIONS_KEY);
  window.localStorage.removeItem(ACTIVE_KEY);
}

export function createEmptySession(): StoredSession {
  const threadId = createThreadId();
  const now = Date.now();
  const session: StoredSession = {
    threadId,
    title: "新会话",
    createdAt: now,
    updatedAt: now,
    turns: [],
    events: [],
    files: [],
    result: "",
    sessionPath: "",
    uploadedFiles: []
  };
  saveSession(session);
  setActiveThreadId(threadId);
  return session;
}

export function ensureSession(): StoredSession {
  const activeId = getActiveThreadId();
  if (activeId) {
    const existing = loadSession(activeId);
    if (existing) {
      return existing;
    }
  }
  // 也检查旧的 threadId 存储键，兼容之前的单会话
  const oldThreadId = window.localStorage.getItem("deepsearch.thread_id");
  if (oldThreadId) {
    const existing = loadSession(oldThreadId);
    if (existing) {
      setActiveThreadId(oldThreadId);
      return existing;
    }
  }
  return createEmptySession();
}

export function markActive(threadId: string): void {
  setActiveThreadId(threadId);
}

export function toStoredUploadedFiles(items: UploadedItem[]): StoredUploadedFile[] {
  return items.map((item) => ({
    uid: item.uid,
    name: item.name,
    size: item.size
  }));
}
