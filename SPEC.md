# Bili-Sync 功能規格書 (SPEC)

> 版本：0.1.0｜最後更新：2026-05-13

---

## 1. 專案目標

讓不同地點的使用者，在 Bilibili 觀看相同影片時能夠即時同步播放狀態（播放、暫停、跳轉、換集）。

---

## 2. 架構總覽

```
┌─────────────────────────────────────────────────────┐
│                Chrome Extension (MV3)                │
│                                                     │
│  ┌──────────┐  chrome.tabs.sendMessage  ┌─────────┐ │
│  │  Popup   │ ◄────────────────────────► │Content  │ │
│  │  (React) │                           │ Script  │ │
│  └──────────┘                           └────┬────┘ │
│                                              │       │
│  ┌──────────────────────────┐          WebSocket    │
│  │  Background Service      │               │       │
│  │  Worker（訊息路由備援）    │               │       │
│  └──────────────────────────┘               │       │
└─────────────────────────────────────────────┼───────┘
                                              │
                                    ┌─────────▼────────┐
                                    │  Sync Server      │
                                    │  Node.js +        │
                                    │  Socket.io        │
                                    │  (port 3001)      │
                                    └──────────────────┘
```

---

## 3. 元件職責

### 3.1 Content Script (`src/content/index.ts`)
| 職責 | 說明 |
|------|------|
| 影片元素偵測 | MutationObserver 監聽 DOM，依優先序查找 `<video>` 元素 |
| 事件監聽（發送） | 監聽 `play` / `pause` / `seeked` 事件，發送 `sync_event` 至伺服器 |
| 事件接收（套用） | 接收伺服器廣播的 `sync_event`，套用到本地影片 |
| 防循環觸發 | `isRemoteTrigger` 旗標，套用遠端指令時暫時停止發送 |
| SPA 換頁偵測 | 攔截 `history.pushState`，偵測 Bilibili 換集行為 |
| Socket.io 管理 | 持有長連線，處理斷線重連後自動重入房間 |
| 訊息橋接 | 接收 Popup 的 `JOIN_ROOM` / `LEAVE_ROOM` / `GET_STATUS` 指令 |
| 日誌廣播 | 傳送 `LOG_EVENT` 給 Popup 顯示即時狀態 |

### 3.2 Background Service Worker (`src/background/index.ts`)
| 職責 | 說明 |
|------|------|
| 安裝通知 | `onInstalled` 時 console.log |
| 訊息路由 | 非 tab 來源的訊息（備援）轉發到當前活躍分頁 |

> ⚠ Socket.io 長連線**不由** Service Worker 持有，避免 MV3 休眠中斷連線。

### 3.3 Popup (`src/popup/`)
| 元件 | 職責 |
|------|------|
| `App.tsx` | 主狀態管理，收發 chrome 訊息 |
| `StatusBar.tsx` | 顯示連線狀態、縮寫 userId |
| `RoomPanel.tsx` | 輸入/產生房間代碼、加入/離開房間 |
| `MemberList.tsx` | 顯示房間成員列表、房主標記 |
| `LogPanel.tsx` | 即時顯示 Content Script 的操作日誌 |

### 3.4 同步伺服器 (`server/src/index.ts`)
| 職責 | 說明 |
|------|------|
| 房間管理 | `Map<roomId, Map<socketId, RoomMember>>` 記憶體儲存 |
| 事件廣播 | 接收 `sync_event`，轉發給同房間其他成員（排除發送者） |
| 房主選舉 | 第一位加入者為房主；房主離線時自動移交 |
| 斷線清理 | `disconnect` 時從房間移除並廣播成員更新 |
| 健康檢查 | `GET /health` 回傳房間數與連線數 |

---

## 4. 事件協議

### 4.1 Socket.io 事件（Client ↔ Server）

#### Client → Server

| 事件名稱 | Payload | 說明 |
|----------|---------|------|
| `join_room` | `{ roomId: string, userId: string }` | 加入或建立房間 |
| `leave_room` | `{ roomId: string, userId: string }` | 主動離開房間 |
| `sync_event` | `SyncEvent` | 廣播影片操作 |

#### Server → Client

| 事件名稱 | Payload | 說明 |
|----------|---------|------|
| `room_state` | `{ members: RoomMember[], isHost: boolean }` | 加入成功後的房間快照 |
| `member_update` | `{ members: RoomMember[] }` | 成員加入/離開時廣播 |
| `sync_event` | `SyncEvent` | 轉發其他成員的影片操作（排除自己） |

### 4.2 SyncEvent 結構
```typescript
interface SyncEvent {
  action: 'SYNC_PLAY' | 'SYNC_PAUSE' | 'SYNC_SEEK' | 'SYNC_EPISODE';
  time: number;       // video.currentTime（秒，0–86400）
  roomId: string;     // 最長 20 字元，僅 [A-Za-z0-9_-]
  userId: string;     // 持久化於 localStorage，最長 40 字元
  episodeUrl?: string; // 僅 SYNC_EPISODE 使用
}
```

### 4.3 Extension 內部訊息（Popup ↔ Content Script）

| action | 方向 | 說明 |
|--------|------|------|
| `JOIN_ROOM` | Popup → CS | 加入房間，帶 `roomId` |
| `LEAVE_ROOM` | Popup → CS | 離開房間 |
| `GET_STATUS` | Popup → CS | 取得 CS 當前狀態快照 |
| `CONNECTION_STATUS` | CS → Popup | Socket 連線狀態變更 |
| `MEMBER_UPDATE` | CS → Popup | 房間成員變更 |
| `ROOM_STATE` | CS → Popup | 房間狀態重置（離開房間後） |
| `LOG_EVENT` | CS → Popup | 即時日誌條目 |

---

## 5. 影片元素選擇優先序

Content Script 依以下順序查找影片元素：

| 優先 | 選擇器 | 適用場景 |
|------|--------|----------|
| 1 | `.bpx-player-video-wrap video` | 新版 BPX 播放器（主流） |
| 2 | `.bilibili-player-video video` | 舊版播放器 |
| 3 | `bwp-video` | 硬解自訂元素模式 |
| 4 | `video` | 最後回退 |

---

## 6. 防循環觸發機制

```
遠端同步指令到達
  └─► isRemoteTrigger = true
        └─► 套用到本地 video (play/pause/currentTime)
              └─► 本地 video 觸發 play/pause/seeked 事件
                    └─► onPlay/onPause/onSeeked 偵測到 isRemoteTrigger = true
                          └─► 跳過，不發送 sync_event
  └─► 500ms 後 isRemoteTrigger = false
```

---

## 7. 使用者識別

- **userId**：存於 `localStorage['bili-sync-user-id']`，格式 `u-{timestamp36}-{random5}`
- 跨分頁、跨重啟持久化（同瀏覽器）
- 不同瀏覽器/裝置產生不同 userId

---

## 8. SPA 換頁偵測

Bilibili 使用 History API 做無重載換集。偵測方式：
1. 攔截 `history.pushState`
2. 監聽 `popstate` 事件
3. 換頁後 1.5 秒重新查找影片元素
4. 若在房間內，廣播 `SYNC_EPISODE` 帶新 URL

---

## 9. 已知限制 / 待解技術債

| 問題 | 說明 | 優先級 |
|------|------|--------|
| 進度補償 | 網路延遲導致 A 發送暫停時 B 已多跑 N 秒 | 高 |
| 換集秒數同步 | SYNC_EPISODE 後沒有配合 SYNC_SEEK | 中 |
| 自動播放封鎖 | 瀏覽器可能阻擋 `play()` | 低 |
| 記憶體儲存 | 伺服器重啟房間消失 | 低 |
| CORS 限制 | 生產環境應限制 origin 為 Extension ID | 安全 |

---

## 10. 環境變數

| 變數名稱 | 預設值 | 說明 |
|----------|--------|------|
| `VITE_SERVER_URL` | `http://localhost:3001` | Extension 連接的同步伺服器位址 |
| `PORT` | `3001` | 伺服器監聽 port |
