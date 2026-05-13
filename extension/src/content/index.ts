import { io, Socket } from 'socket.io-client';
import type {
  SyncEvent,
  InternalMessage,
  RoomMember,
  ContentScriptStatus,
  LogLevel,
} from '../types';

// ─── 設定 ──────────────────────────────────────────────────────
// 使用標準 import.meta.env，讓 Vite 靜態替換
const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

// Bilibili 影片元素選擇器優先序
const VIDEO_SELECTORS = [
  '.bpx-player-video-wrap video',  // 新版 BPX 播放器（主流）
  '.bilibili-player-video video',  // 舊版播放器
  'bwp-video',                     // 硬解自訂元素模式
  'video',                         // 最後回退
] as const;

// ─── 工具函式 ──────────────────────────────────────────────────

function getOrCreateUserId(): string {
  const KEY = 'bili-sync-user-id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── 主要同步客戶端 ────────────────────────────────────────────

class BiliSyncClient {
  private static readonly ROOM_PERSIST_KEY = 'bili-sync-resume-room';

  private socket: Socket;
  private videoEl: HTMLVideoElement | null = null;
  private domObserver: MutationObserver | null = null;
  private isRemoteTrigger = false;
  private readonly userId = getOrCreateUserId();

  private state: ContentScriptStatus = {
    isConnected: false,
    roomId: null,
    members: [],
    isHost: false,
    userId: this.userId,
    videoFound: false,
  };

  constructor() {
    this.log('info', 'Bili-Sync 初始化', `伺服器：${SERVER_URL} | userId：${this.userId}`);
    this.restoreRoomFromStorage(); // 頁面重載後恢復房間（必須在 createSocket 前）
    this.socket = this.createSocket();
    this.observeDOMForVideo();
    this.listenChromeMessages();
    this.patchHistoryForSPA();
  }

  // ── 頁面跳轉房間恢復 ─────────────────────────────────────────

  /** 跳轉前將 roomId 寫入 sessionStorage，重載後自動重入 */
  private navigateToEpisode(url: string): void {
    if (this.state.roomId) {
      sessionStorage.setItem(BiliSyncClient.ROOM_PERSIST_KEY, this.state.roomId);
      this.log('info', '跳轉前保存房間 ID', this.state.roomId);
    }
    window.location.href = url;
  }

  /** 頁面重載後從 sessionStorage 恢復 roomId */
  private restoreRoomFromStorage(): void {
    const saved = sessionStorage.getItem(BiliSyncClient.ROOM_PERSIST_KEY);
    if (saved) {
      sessionStorage.removeItem(BiliSyncClient.ROOM_PERSIST_KEY);
      this.state.roomId = saved;
      this.log('info', '已從頁面跳轉恢復房間', saved);
    }
  }

  // ── 日誌 ─────────────────────────────────────────────────────

  private log(level: LogLevel, message: string, detail?: string): void {
    const prefix = '[Bili-Sync]';
    if (level === 'error') {
      console.error(prefix, message, detail ?? '');
    } else if (level === 'warn') {
      console.warn(prefix, message, detail ?? '');
    } else {
      console.log(prefix, `[${level}]`, message, detail ?? '');
    }

    const msg: InternalMessage = {
      action: 'LOG_EVENT',
      logEntry: { level, message, timestamp: Date.now(), detail },
    };
    chrome.runtime.sendMessage(msg).catch(() => undefined);
  }

  // ── Socket 連線 ──────────────────────────────────────────────

  private createSocket(): Socket {
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionAttempts: Infinity,
    });

    socket.on('connect', () => {
      this.state.isConnected = true;
      this.log('info', '伺服器已連線', `socket.id: ${socket.id}`);
      this.notifyPopup('CONNECTION_STATUS');

      if (this.state.roomId) {
        this.log('info', '重連後自動重入房間', this.state.roomId);
        socket.emit('join_room', { roomId: this.state.roomId, userId: this.userId });
      }
    });

    socket.on('disconnect', (reason) => {
      this.state.isConnected = false;
      this.log('warn', '伺服器已斷線', reason);
      this.notifyPopup('CONNECTION_STATUS');
    });

    socket.on('connect_error', (err) => {
      this.log('error', '無法連線到伺服器', `${err.message} → ${SERVER_URL}`);
    });

    socket.on('sync_event', (event: SyncEvent) => {
      this.applyRemoteEvent(event);
    });

    socket.on('room_state', (data: { members: RoomMember[]; isHost: boolean }) => {
      this.state.members = data.members;
      this.state.isHost = data.isHost;
      this.log('info', '房間狀態已取得', `成員 ${data.members.length} 人，${data.isHost ? '我是房主' : '我是成員'}`);
      this.notifyPopup('MEMBER_UPDATE');
    });

    socket.on('member_update', (data: { members: RoomMember[] }) => {
      this.state.members = data.members;
      this.log('info', '成員列表更新', `${data.members.length} 人`);
      this.notifyPopup('MEMBER_UPDATE');
    });

    return socket;
  }

  // ── 影片元素偵測 ─────────────────────────────────────────────

  private observeDOMForVideo(): void {
    this.findAndAttachVideo();

    this.domObserver = new MutationObserver(() => {
      this.findAndAttachVideo();
    });

    this.domObserver.observe(document.body, { childList: true, subtree: true });
  }

  private findAndAttachVideo(): void {
    let el: HTMLVideoElement | null = null;
    let matchedSelector = '';

    for (const selector of VIDEO_SELECTORS) {
      const found = document.querySelector<HTMLVideoElement>(selector);
      if (found) {
        el = found;
        matchedSelector = selector;
        break;
      }
    }

    if (el && el !== this.videoEl) {
      this.detachVideoListeners();
      this.videoEl = el;
      this.state.videoFound = true;
      this.attachVideoListeners();
      this.log('info', '影片元素已找到', `selector: "${matchedSelector}"`);
    } else if (!el && this.videoEl) {
      this.detachVideoListeners();
      this.videoEl = null;
      this.state.videoFound = false;
      this.log('warn', '影片元素消失，等待重新出現');
    }
  }

  private attachVideoListeners(): void {
    if (!this.videoEl) return;
    this.videoEl.addEventListener('play', this.onPlay);
    this.videoEl.addEventListener('pause', this.onPause);
    this.videoEl.addEventListener('seeked', this.onSeeked);
  }

  private detachVideoListeners(): void {
    if (!this.videoEl) return;
    this.videoEl.removeEventListener('play', this.onPlay);
    this.videoEl.removeEventListener('pause', this.onPause);
    this.videoEl.removeEventListener('seeked', this.onSeeked);
  }

  // ── 影片事件發送 ─────────────────────────────────────────────

  private readonly onPlay = (): void => {
    if (this.isRemoteTrigger || !this.state.roomId) return;
    this.log('sync-out', '▶ 播放', `t=${formatTime(this.videoEl?.currentTime ?? 0)}`);
    this.emitSyncEvent('SYNC_PLAY');
  };

  private readonly onPause = (): void => {
    if (this.isRemoteTrigger || !this.state.roomId) return;
    this.log('sync-out', '⏸ 暫停', `t=${formatTime(this.videoEl?.currentTime ?? 0)}`);
    this.emitSyncEvent('SYNC_PAUSE');
  };

  private readonly onSeeked = (): void => {
    if (this.isRemoteTrigger || !this.state.roomId) return;
    this.log('sync-out', '⏩ 跳轉', `t=${formatTime(this.videoEl?.currentTime ?? 0)}`);
    this.emitSyncEvent('SYNC_SEEK');
  };

  private emitSyncEvent(action: SyncEvent['action']): void {
    if (!this.videoEl || !this.state.roomId) return;

    const event: SyncEvent = {
      action,
      time: this.videoEl.currentTime,
      roomId: this.state.roomId,
      userId: this.userId,
    };

    this.socket.emit('sync_event', event);
  }

  // ── 遠端事件接收 ─────────────────────────────────────────────

  private applyRemoteEvent(event: SyncEvent): void {
    if (event.userId === this.userId || !this.videoEl) return;

    const from = event.userId.slice(-6);
    this.log('sync-in', `← ${event.action}`, `from:${from} t=${formatTime(event.time)}`);

    this.isRemoteTrigger = true;

    try {
      const timeDrift = Math.abs(this.videoEl.currentTime - event.time);

      switch (event.action) {
        case 'SYNC_PLAY':
          if (timeDrift > 1) this.videoEl.currentTime = event.time;
          this.videoEl.play().catch(() => {
            this.log('warn', '自動播放被瀏覽器阻擋', '請手動點擊頁面後重試');
          });
          break;

        case 'SYNC_PAUSE':
          if (timeDrift > 1) this.videoEl.currentTime = event.time;
          this.videoEl.pause();
          break;

        case 'SYNC_SEEK':
          this.videoEl.currentTime = event.time;
          break;

        case 'SYNC_EPISODE':
          if (event.episodeUrl && window.location.href !== event.episodeUrl) {
            this.log('info', '換集中…', event.episodeUrl);
            this.navigateToEpisode(event.episodeUrl);
          }
          break;
      }
    } finally {
      setTimeout(() => {
        this.isRemoteTrigger = false;
      }, 500);
    }
  }

  // ── Chrome Extension 內部訊息 ────────────────────────────────

  private listenChromeMessages(): void {
    chrome.runtime.onMessage.addListener(
      (message: InternalMessage, _sender, sendResponse) => {
        this.handleMessage(message, sendResponse);
        return true;
      }
    );
  }

  private handleMessage(
    message: InternalMessage,
    sendResponse: (res: unknown) => void
  ): void {
    switch (message.action) {
      case 'JOIN_ROOM': {
        const roomId = message.roomId?.trim().slice(0, 20);
        if (!roomId) { sendResponse({ success: false, error: 'roomId 不得為空' }); return; }
        this.state.roomId = roomId;
        this.socket.emit('join_room', { roomId, userId: this.userId });
        this.log('info', `加入房間：${roomId}`);
        sendResponse({ success: true });
        break;
      }
      case 'LEAVE_ROOM': {
        if (this.state.roomId) {
          this.socket.emit('leave_room', {
            roomId: this.state.roomId,
            userId: this.userId,
          });
          this.log('info', `離開房間：${this.state.roomId}`);
        }
        this.state.roomId = null;
        this.state.members = [];
        this.state.isHost = false;
        this.notifyPopup('ROOM_STATE');
        sendResponse({ success: true });
        break;
      }
      case 'GET_STATUS': {
        sendResponse({ ...this.state });
        break;
      }
      case 'SHARE_VIDEO': {
        if (!this.state.roomId) {
          sendResponse({ success: false, error: '尚未加入房間' });
          return;
        }
        if (!this.state.isHost) {
          sendResponse({ success: false, error: '只有房主可以分享影片' });
          return;
        }
        const event: SyncEvent = {
          action: 'SYNC_EPISODE',
          time: this.videoEl?.currentTime ?? 0,
          roomId: this.state.roomId,
          userId: this.userId,
          episodeUrl: location.href,
        };
        this.socket.emit('sync_event', event);
        this.log('sync-out', '→ 分享目前影片', location.href);
        sendResponse({ success: true });
        break;
      }
      default:
        sendResponse({ success: false, error: 'unknown_action' });
    }
  }

  private notifyPopup(action: InternalMessage['action']): void {
    const msg: InternalMessage = {
      action,
      isConnected: this.state.isConnected,
      isInRoom: !!this.state.roomId,
      members: this.state.members,
      roomId: this.state.roomId ?? undefined,
    };
    chrome.runtime.sendMessage(msg).catch(() => undefined);
  }

  // ── SPA 換頁偵測 ─────────────────────────────────────────────

  private patchHistoryForSPA(): void {
    let lastHref = location.href;

    const handleNavigation = (): void => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      this.log('info', 'SPA 換頁偵測', location.href);

      setTimeout(() => {
        this.videoEl = null;
        this.state.videoFound = false;
        this.findAndAttachVideo();
        // 換頁後不自動廣播，等房主手動點「分享目前影片」
      }, 1500);
    };

    const originalPush = history.pushState.bind(history);
    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      originalPush(...args);
      handleNavigation();
    };

    window.addEventListener('popstate', handleNavigation);
  }
}

// ── 初始化 ────────────────────────────────────────────────────
new BiliSyncClient();
