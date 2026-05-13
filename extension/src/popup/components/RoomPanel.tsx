import { useState } from 'react';

interface RoomPanelProps {
  roomId: string | null;
  isHost: boolean;
  isLoading: boolean;
  onJoin: (roomId: string) => void;
  onLeave: () => void;
  onShareVideo: () => void;
}

export default function RoomPanel({
  roomId,
  isHost,
  isLoading,
  onJoin,
  onLeave,
  onShareVideo,
}: RoomPanelProps) {
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);

  const generateCode = () => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    setInput(code);
  };

  const copyRoomId = async () => {
    if (!roomId) return;
    await navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = () => {
    const trimmed = input.trim().toUpperCase();
    if (trimmed) onJoin(trimmed);
  };

  // ── 已在房間中 ──────────────────────────────────────────────

  if (roomId) {
    return (
      <div className="bg-gray-800 rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 uppercase tracking-wider">當前房間</span>
          {isHost && (
            <span className="text-xs bg-bilibili-pink/20 text-bilibili-pink border border-bilibili-pink/30 px-2 py-0.5 rounded-full">
              房主
            </span>
          )}
        </div>

        {/* 房間代碼 */}
        <button
          onClick={copyRoomId}
          className="w-full flex items-center justify-between bg-gray-700/60 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors group"
          title="點擊複製"
        >
          <span className="font-mono text-xl font-bold text-bilibili-pink tracking-widest">
            {roomId}
          </span>
          <span className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
            {copied ? '✓ 已複製' : '複製'}
          </span>
        </button>

        {/* 分享目前影片（房主限定） */}
        {isHost && (
          <button
            onClick={onShareVideo}
            className="w-full py-2 bg-bilibili-blue hover:bg-bilibili-blue/80 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <span>📺</span>
            <span>分享目前影片給所有成員</span>
          </button>
        )}

        <button
          onClick={onLeave}
          disabled={isLoading}
          className="w-full py-2 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? '離開中...' : '離開房間'}
        </button>
      </div>
    );
  }

  // ── 尚未加入房間 ─────────────────────────────────────────────

  return (
    <div className="bg-gray-800 rounded-xl p-3 space-y-3">
      <p className="text-xs text-gray-400">輸入或產生房間代碼，與朋友一起同步觀看</p>

      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
        placeholder="例如：ABC123"
        maxLength={10}
        className="w-full bg-gray-700 text-white placeholder-gray-500 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-bilibili-pink/60 transition"
      />

      <div className="flex gap-2">
        <button
          onClick={generateCode}
          className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
        >
          隨機產生
        </button>
        <button
          onClick={handleJoin}
          disabled={isLoading || !input.trim()}
          className="flex-1 py-2 bg-bilibili-pink hover:bg-bilibili-pink/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? '加入中...' : '加入房間'}
        </button>
      </div>
    </div>
  );
}
