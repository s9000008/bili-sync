import { useState, useEffect, useCallback } from 'react';
import type { ContentScriptStatus, InternalMessage, RoomMember, LogEntry } from '../types';
import RoomPanel from './components/RoomPanel';
import StatusBar from './components/StatusBar';
import MemberList from './components/MemberList';
import LogPanel from './components/LogPanel';

const MAX_LOGS = 100;

// ─── 與 Content Script 通訊的輔助函式 ─────────────────────────

async function sendToContentScript<T = unknown>(message: InternalMessage): Promise<T> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('無法取得當前分頁');

  return new Promise<T>((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id!, message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ─── 主元件 ───────────────────────────────────────────────────

export default function App() {
  const [status, setStatus] = useState<ContentScriptStatus>({
    isConnected: false,
    roomId: null,
    members: [],
    isHost: false,
    userId: '',
    videoFound: false,
  });
  const [isBiliPage, setIsBiliPage] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  // 取得 Content Script 的初始狀態
  const fetchStatus = useCallback(async () => {
    try {
      const result = await sendToContentScript<ContentScriptStatus>({ action: 'GET_STATUS' });
      setStatus(result);
      setIsBiliPage(true);
    } catch {
      setIsBiliPage(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // 監聽 Content Script 推送的狀態更新
    const listener = (message: InternalMessage) => {
      if (message.action === 'CONNECTION_STATUS') {
        setStatus((prev) => ({ ...prev, isConnected: message.isConnected ?? prev.isConnected }));
      }
      if (message.action === 'MEMBER_UPDATE' || message.action === 'ROOM_STATE') {
        setStatus((prev) => ({
          ...prev,
          members: (message.members as RoomMember[]) ?? prev.members,
          roomId: message.roomId ?? prev.roomId ?? null,
        }));
      }
      if (message.action === 'LOG_EVENT' && message.logEntry) {
        setLogs((prev) => {
          const next = [...prev, message.logEntry!];
          return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
        });
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [fetchStatus]);

  // ── 加入房間 ────────────────────────────────────────────────

  const handleJoinRoom = async (roomId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await sendToContentScript<{ success: boolean; error?: string }>({
        action: 'JOIN_ROOM',
        roomId,
      });
      if (!res.success) throw new Error(res.error ?? '加入失敗');
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : '連線錯誤，請確認伺服器是否啟動');
    } finally {
      setIsLoading(false);
    }
  };

  // ── 離開房間 ────────────────────────────────────────────────

  const handleLeaveRoom = async () => {
    setIsLoading(true);
    try {
      await sendToContentScript({ action: 'LEAVE_ROOM' });
      setStatus((prev) => ({ ...prev, roomId: null, members: [], isHost: false }));
    } catch {
      // 忽略離開時的錯誤
    } finally {
      setIsLoading(false);
    }
  };

  // ── 分享目前影片（房主手動廣播目前 URL） ────────────────────

  const handleShareVideo = async () => {
    setError(null);
    try {
      const res = await sendToContentScript<{ success: boolean; error?: string }>({
        action: 'SHARE_VIDEO',
      });
      if (!res.success) throw new Error(res.error ?? '分享失敗');
    } catch (e) {
      setError(e instanceof Error ? e.message : '分享失敗');
    }
  };

  return (
    <div className="w-80 min-h-40 bg-gray-900 text-white font-sans select-none">
      {/* 頂部狀態列 */}
      <StatusBar isConnected={status.isConnected} userId={status.userId} />

      <div className="p-4 space-y-3">
        {!isBiliPage ? (
          <div className="text-center py-6">
            <div className="text-3xl mb-2">📺</div>
            <p className="text-gray-400 text-sm">
              請先前往 Bilibili 影片或番劇頁面
            </p>
            <p className="text-gray-600 text-xs mt-1">
              bilibili.com/video/* 或 bilibili.com/bangumi/*
            </p>
          </div>
        ) : (
          <>
            {/* 影片偵測狀態 */}
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${status.videoFound ? 'bg-green-400' : 'bg-gray-600'}`}
              />
              <span className="text-xs text-gray-400">
                {status.videoFound ? '影片元素已偵測' : '未偵測到影片元素'}
              </span>
            </div>

            {/* 房間管理 */}
            <RoomPanel
              roomId={status.roomId}
              isHost={status.isHost}
              isLoading={isLoading}
              onJoin={handleJoinRoom}
              onLeave={handleLeaveRoom}
              onShareVideo={handleShareVideo}
            />

            {/* 成員列表（加入房間後才顯示） */}
            {status.roomId && (
              <MemberList members={status.members} currentUserId={status.userId} />
            )}

            {/* 錯誤提示 */}
            {error && (
              <div className="bg-red-900/40 border border-red-700/50 rounded-lg px-3 py-2 text-xs text-red-300">
                ⚠ {error}
              </div>
            )}

            {/* Log 切換按鈕 */}
            <button
              onClick={() => setShowLog((v) => !v)}
              className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
            >
              {showLog ? '▲ 隱藏日誌' : '▼ 顯示日誌'}
            </button>

            {/* Log 視窗 */}
            {showLog && (
              <LogPanel logs={logs} onClear={() => setLogs([])} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
