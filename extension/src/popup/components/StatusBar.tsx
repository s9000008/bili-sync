interface StatusBarProps {
  isConnected: boolean;
  userId: string;
}

export default function StatusBar({ isConnected, userId }: StatusBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
      <div className="flex items-center gap-2">
        <span className="text-bilibili-pink font-bold text-base">🎬 Bili-Sync</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full transition-colors ${
            isConnected ? 'bg-green-400' : 'bg-gray-600'
          }`}
        />
        <span className="text-xs text-gray-400">{isConnected ? '已連線' : '未連線'}</span>
        {userId && (
          <span className="text-xs text-gray-600 font-mono" title={userId}>
            {userId.slice(-6)}
          </span>
        )}
      </div>
    </div>
  );
}
