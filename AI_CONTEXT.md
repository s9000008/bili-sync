# AI_CONTEXT.md — Bili-Sync 專案規範

> 每次開啟新對話前，將此文件內容貼給 AI，確保上下文一致。

---

## 專案：Bili-Sync

**目標**：Bilibili 異地同步觀看 Chrome 擴充套件（MV3）+ 後端同步伺服器

---

## 技術棧

| 部分 | 技術 |
|------|------|
| Extension UI | React 18 + Tailwind CSS |
| 構建工具 | Vite 4 + CRXJS (`@crxjs/vite-plugin`) |
| 語言 | TypeScript（strict mode） |
| 播放器互動 | DOM / Content Script（不使用框架） |
| 即時同步 | Socket.io 4（WebSocket 傳輸） |
| 後端 | Node.js + Express + Socket.io |

---

## 架構規則（AI 必須遵守）

1. **Manifest V3**：背景腳本為 Service Worker，不持有長連線。Socket.io 連線由 Content Script 管理。
2. **安全性**：Content Script 只在 `bilibili.com/video/*` 和 `bilibili.com/bangumi/*` 執行。
3. **防循環觸發**：所有遠端事件套用前設 `isRemoteTrigger = true`，500ms 後重設。
4. **輸入驗證**：Server 端所有 socket 事件必須驗證型別與長度。
5. **SPA 換頁**：透過攔截 `history.pushState` 偵測 Bilibili 的換集行為。
6. **碼風格**：Functional + Async/Await；完整錯誤處理；避免 `any`。

---

## 自訂事件協議

```typescript
interface SyncEvent {
  action: 'SYNC_PLAY' | 'SYNC_PAUSE' | 'SYNC_SEEK' | 'SYNC_EPISODE';
  time: number;      // video.currentTime（秒）
  roomId: string;    // 最長 20 字元
  userId: string;    // 持久化於 localStorage
  episodeUrl?: string; // 僅 SYNC_EPISODE 使用
}
```

---

## 目前進度

- [x] 初始化 Vite + React + CRXJS 環境
- [x] 共用型別定義（`src/types/index.ts`）
- [x] Background Service Worker（訊息路由）
- [x] Content Script（Socket.io 連線 + 影片監聽 + SPA 換頁偵測）
- [x] Popup UI（房間管理 + 成員列表）
- [x] Node.js 同步伺服器（房間管理 + 事件廣播）
- [ ] 進度補償演算法（第三階段）
- [ ] 單元測試
- [ ] 打包 & 上架 Chrome Web Store

---

## 待解決的技術債

- Bilibili 換集時，Content Script 重新找到影片元素有約 1.5 秒延遲，可能造成短暫去同步
- `SYNC_EPISODE` 換集後，跳轉目標秒數尚未同步（需配合 `SYNC_SEEK`）
- 生產環境 CORS 應限制為 Extension ID

---

## AI 指引

- 生成代碼前，確認是否與 Bilibili 原生快捷鍵（←→ 跳轉、空白鍵播放）衝突
- 所有 UI 元件使用 Tailwind CSS，顏色以 `bilibili-pink (#fb7299)` 為主調
- 伺服器端不儲存影片狀態，只做事件廣播（stateless relay）
- 新增功能時優先考慮「對非技術使用者是否直覺」
