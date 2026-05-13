# Bili-Sync

Bilibili 異地同步觀看 Chrome 擴充套件。讓你與朋友無論身在何處，都能同步播放、暫停、跳轉，並自動跟進換集。

## 專案結構

```
watch-party/
├── extension/          # Chrome 擴充套件（MV3）
│   └── src/
│       ├── types/      # 共用 TypeScript 型別
│       ├── background/ # Service Worker（訊息路由）
│       ├── content/    # Content Script（Socket.io + 影片監聽）
│       └── popup/      # Popup UI（React + Tailwind）
└── server/             # 同步伺服器（Node.js + Socket.io）
    └── src/
        └── index.ts
```

## 快速開始

### 1. 安裝依賴

```bash
# 安裝根工作區
npm install

# 安裝 extension 與 server 各自依賴
npm install --workspace=extension
npm install --workspace=server
```

### 2. 啟動同步伺服器（開發）

```bash
# 複製環境變數範例
cp server/.env.example server/.env

# 啟動伺服器（預設 port 3001）
npm run dev:server
```

### 3. 啟動 Extension 開發模式

```bash
# 複製環境變數範例
cp extension/.env.example extension/.env

# 啟動 Vite dev server（熱更新）
npm run dev:ext
```

### 4. 載入擴充套件到 Chrome

1. 開啟 `chrome://extensions/`
2. 開啟右上角「開發人員模式」
3. 點擊「載入未封裝項目」
4. 選擇 `extension/dist` 資料夾（執行 `npm run build:ext` 後產生）

---

## 使用方式

1. 在 Bilibili 影片頁面點擊擴充套件圖示
2. 輸入相同的房間代碼（或由其中一人產生後分享）
3. 點擊「加入房間」
4. 雙方的播放、暫停、跳轉、換集都會即時同步

---

## 生產部署

### 伺服器部署（以 Fly.io 為例）

```bash
cd server
fly launch
fly deploy
```

### 更新 Extension 的伺服器位址

編輯 `extension/.env`，將 `VITE_SERVER_URL` 改為你的部署位址：

```
VITE_SERVER_URL=https://your-app.fly.dev
```

同時將 `extension/manifest.json` 的 `host_permissions` 加入你的伺服器網域。

---

## 技術架構

| 層次 | 技術 | 說明 |
|------|------|------|
| Extension UI | React 18 + Tailwind CSS | Popup 介面 |
| Extension 邏輯 | TypeScript + Vite + CRXJS | 構建工具 |
| 播放器互動 | Content Script + DOM | 監聽 `<bwp-video>` / `<video>` |
| 即時同步 | Socket.io (WebSocket) | 直接由 Content Script 連線 |
| 背景腳本 | MV3 Service Worker | 僅做訊息路由 |
| 後端 | Node.js + Express + Socket.io | 房間管理 + 事件廣播 |

## 同步事件流程

```
使用者按暫停
  └─► Content Script 偵測 pause 事件（isRemoteTrigger = false）
        └─► socket.emit('sync_event', { action: 'SYNC_PAUSE', time, roomId })
              └─► Server 廣播給房間內其他人
                    └─► 遠端 Content Script 接收
                          └─► 設 isRemoteTrigger = true
                                └─► video.pause() → pause 事件觸發但被攔截
                                      └─► 500ms 後重設 isRemoteTrigger = false
```
