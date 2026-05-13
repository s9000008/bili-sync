import type { RoomMember } from '../../types';

interface MemberListProps {
  members: RoomMember[];
  currentUserId: string;
}

/** 從 userId 取得顯示用的縮寫（最後 4 碼） */
function shortId(userId: string): string {
  return userId.length > 4 ? userId.slice(-4) : userId;
}

/** 根據 userId 產生固定的背景色（避免每次重新渲染時閃爍） */
function avatarColor(userId: string): string {
  const colors = [
    'bg-pink-600', 'bg-purple-600', 'bg-blue-600',
    'bg-teal-600', 'bg-orange-600', 'bg-yellow-600',
  ];
  const index = userId.charCodeAt(userId.length - 1) % colors.length;
  return colors[index];
}

export default function MemberList({ members, currentUserId }: MemberListProps) {
  return (
    <div className="bg-gray-800 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 uppercase tracking-wider">成員</span>
        <span className="text-xs text-gray-600">{members.length} 人</span>
      </div>

      {members.length === 0 ? (
        <p className="text-xs text-gray-600 text-center py-2">等待其他人加入...</p>
      ) : (
        <ul className="space-y-1.5">
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            return (
              <li key={member.userId} className="flex items-center gap-2">
                {/* 頭像 */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(member.userId)}`}
                >
                  {shortId(member.userId)}
                </div>

                {/* 名稱 */}
                <span className="text-sm text-gray-300 truncate flex-1 font-mono">
                  {isSelf ? '我' : member.userId}
                </span>

                {/* 標籤 */}
                <div className="flex gap-1 shrink-0">
                  {member.isHost && (
                    <span className="text-xs text-bilibili-pink">★</span>
                  )}
                  {isSelf && (
                    <span className="text-xs text-gray-500">(你)</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
