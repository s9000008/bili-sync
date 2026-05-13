import { useEffect, useRef } from 'react';
import type { LogEntry, LogLevel } from '../../types';

interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
}

const LEVEL_STYLES: Record<LogLevel, string> = {
  'info':     'text-gray-300',
  'warn':     'text-yellow-400',
  'error':    'text-red-400',
  'sync-out': 'text-bilibili-blue',
  'sync-in':  'text-bilibili-pink',
};

const LEVEL_PREFIX: Record<LogLevel, string> = {
  'info':     'ℹ',
  'warn':     '⚠',
  'error':    '✖',
  'sync-out': '↑',
  'sync-in':  '↓',
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export default function LogPanel({ logs, onClear }: LogPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自動捲動到最新訊息
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      {/* 標題列 */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
          即時日誌
        </span>
        <button
          onClick={onClear}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-1"
          title="清除日誌"
        >
          清除
        </button>
      </div>

      {/* 日誌內容 */}
      <div className="h-40 overflow-y-auto font-mono text-xs p-2 space-y-0.5">
        {logs.length === 0 ? (
          <p className="text-gray-600 text-center py-4">尚無日誌</p>
        ) : (
          logs.map((entry, idx) => (
            <div key={idx} className={`flex gap-1.5 leading-relaxed ${LEVEL_STYLES[entry.level]}`}>
              {/* 時間戳 */}
              <span className="text-gray-600 shrink-0">
                {formatTimestamp(entry.timestamp)}
              </span>
              {/* 層級圖示 */}
              <span className="shrink-0">{LEVEL_PREFIX[entry.level]}</span>
              {/* 訊息 */}
              <span className="break-all">
                {entry.message}
                {entry.detail && (
                  <span className="text-gray-500 ml-1">{entry.detail}</span>
                )}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
