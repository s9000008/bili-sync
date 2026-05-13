import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';

// ─── 型別定義 ─────────────────────────────────────────────────

interface RoomMember {
  userId: string;
  socketId: string;
  isHost: boolean;
}

interface SyncEvent {
  action: 'SYNC_PLAY' | 'SYNC_PAUSE' | 'SYNC_SEEK' | 'SYNC_EPISODE';
  time: number;
  roomId: string;
  userId: string;
  episodeUrl?: string;
}

interface JoinPayload {
  roomId: string;
  userId: string;
}

// ─── 初始化 ───────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    // 在生產環境應限制為你的 Chrome Extension ID：
    // origin: 'chrome-extension://<YOUR_EXTENSION_ID>',
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

/**
 * 房間狀態 Map
 * Key: roomId
 * Value: Map<socketId, RoomMember>
 */
const rooms = new Map<string, Map<string, RoomMember>>();

// ─── 工具函式 ─────────────────────────────────────────────────

function getRoomMemberList(roomId: string): RoomMember[] {
  return Array.from(rooms.get(roomId)?.values() ?? []);
}

function handleMemberLeave(socketId: string, roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;

  const leavingMember = room.get(socketId);
  if (!leavingMember) return;

  room.delete(socketId);

  if (room.size === 0) {
    rooms.delete(roomId);
    return;
  }

  // 如果房主離開，將第一位成員升為新房主
  if (leavingMember.isHost) {
    const [firstSocketId, firstMember] = room.entries().next().value as [string, RoomMember];
    room.set(firstSocketId, { ...firstMember, isHost: true });
  }

  const updatedMembers = getRoomMemberList(roomId);
  io.to(roomId).emit('member_update', { members: updatedMembers });
}

// ─── Socket.io 事件處理 ───────────────────────────────────────

io.on('connection', (socket: Socket) => {
  console.log(`[+] 連線：${socket.id}`);

  // ── 加入房間 ────────────────────────────────────────────────
  socket.on('join_room', (payload: unknown) => {
    // 輸入驗證
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof (payload as JoinPayload).roomId !== 'string' ||
      typeof (payload as JoinPayload).userId !== 'string'
    ) {
      return;
    }

    const { roomId, userId } = payload as JoinPayload;

    // 清理輸入，限制長度
    const safeRoomId = roomId.trim().replace(/[^\w-]/g, '').slice(0, 20);
    const safeUserId = userId.trim().slice(0, 40);

    if (!safeRoomId || !safeUserId) return;

    if (!rooms.has(safeRoomId)) {
      rooms.set(safeRoomId, new Map());
    }

    const room = rooms.get(safeRoomId)!;
    const isHost = room.size === 0;

    room.set(socket.id, { userId: safeUserId, socketId: socket.id, isHost });
    socket.join(safeRoomId);

    const members = getRoomMemberList(safeRoomId);

    // 通知加入者目前房間狀態
    socket.emit('room_state', { members, isHost });
    // 通知其他成員有人加入
    socket.to(safeRoomId).emit('member_update', { members });

    console.log(`[~] ${safeUserId} 加入房間 ${safeRoomId}（房主：${isHost}，人數：${room.size}）`);
  });

  // ── 離開房間 ────────────────────────────────────────────────
  socket.on('leave_room', (payload: unknown) => {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof (payload as { roomId: string }).roomId !== 'string'
    ) {
      return;
    }
    const { roomId } = payload as { roomId: string };
    socket.leave(roomId);
    handleMemberLeave(socket.id, roomId.trim().slice(0, 20));
    console.log(`[-] ${socket.id} 離開房間 ${roomId}`);
  });

  // ── 同步事件轉發 ─────────────────────────────────────────────
  socket.on('sync_event', (event: unknown) => {
    // 嚴格驗證事件格式
    if (
      typeof event !== 'object' ||
      event === null
    ) return;

    const e = event as Partial<SyncEvent>;

    const validActions = ['SYNC_PLAY', 'SYNC_PAUSE', 'SYNC_SEEK', 'SYNC_EPISODE'] as const;
    if (!e.action || !validActions.includes(e.action as typeof validActions[number])) return;
    if (typeof e.time !== 'number' || e.time < 0 || e.time > 86400) return;
    if (typeof e.roomId !== 'string' || e.roomId.length > 20) return;
    if (typeof e.userId !== 'string') return;

    // 只轉發給同房間的「其他」成員（不回傳給發送者）
    socket.to(e.roomId).emit('sync_event', e);
  });

  // ── 斷線 ─────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    rooms.forEach((_, roomId) => handleMemberLeave(socket.id, roomId));
    console.log(`[-] 斷線：${socket.id}`);
  });
});

// ─── HTTP 路由 ────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    connections: io.engine.clientsCount,
  });
});

// ─── 啟動伺服器 ───────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3001);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Bili-Sync Server] 監聽 port ${PORT}`);
  console.log(`健康檢查：http://localhost:${PORT}/health`);
});
