// ─── 日誌 ──────────────────────────────────────────────────────
export type LogLevel = 'info' | 'warn' | 'error' | 'sync-out' | 'sync-in';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number; // Date.now()
  detail?: string;   // 附加資訊（如 action, time）
}

// ─── 共用事件格式 ──────────────────────────────────────────────
/** 同步給遠端成員的影片操作 */
export interface SyncEvent {
  /** 操作類型 */
  action: 'SYNC_PLAY' | 'SYNC_PAUSE' | 'SYNC_SEEK' | 'SYNC_EPISODE';
  /** 影片當前秒數 */
  time: number;
  /** 房間 ID */
  roomId: string;
  /** 發送者 userId */
  userId: string;
  /** 換集時的目標 URL（僅 SYNC_EPISODE 使用） */
  episodeUrl?: string;
}

// ─── Extension 內部通訊格式 ────────────────────────────────────
export type InternalAction =
  | 'JOIN_ROOM'
  | 'LEAVE_ROOM'
  | 'ROOM_STATE'
  | 'MEMBER_UPDATE'
  | 'CONNECTION_STATUS'
  | 'GET_STATUS'
  | 'LOG_EVENT'
  | 'SHARE_VIDEO';

export interface InternalMessage {
  action: InternalAction | SyncEvent['action'];
  roomId?: string;
  time?: number;
  members?: RoomMember[];
  isConnected?: boolean;
  isInRoom?: boolean;
  episodeUrl?: string;
  logEntry?: LogEntry;
}

// ─── 房間成員 ──────────────────────────────────────────────────
export interface RoomMember {
  userId: string;
  isHost: boolean;
}

// ─── Content Script 狀態快照 ──────────────────────────────────
export interface ContentScriptStatus {
  isConnected: boolean;
  roomId: string | null;
  members: RoomMember[];
  isHost: boolean;
  userId: string;
  videoFound: boolean;
}
