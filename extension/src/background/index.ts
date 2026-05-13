/**
 * Background Service Worker (Manifest V3)
 *
 * 職責：在 Popup 與 Content Script 之間轉發訊息。
 * Socket.io 連線由 Content Script 直接管理，避免 Service Worker
 * 被瀏覽器休眠後中斷長連線。
 */

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    console.log('[Bili-Sync] 擴充套件已安裝');
  }
});

/**
 * 統一的訊息路由：
 * - 來自 Popup（無 sender.tab）→ 轉發到當前活躍分頁的 Content Script
 * - 來自 Content Script → 轉發到 Popup（chrome.runtime.sendMessage 廣播）
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 訊息來源為 Popup（沒有 tab 資訊）
  if (!sender.tab) {
    forwardToActiveTab(message, sendResponse);
    return true; // 保持非同步通道開放
  }

  // 訊息來源為 Content Script，轉發給 Popup
  // Popup 自行監聽 chrome.runtime.onMessage，此處無需額外處理
  sendResponse({ forwarded: true });
});

async function forwardToActiveTab(
  message: unknown,
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      sendResponse({ success: false, error: 'no_active_tab' });
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, message).catch((err: Error) => ({
      success: false,
      error: err.message,
    }));

    sendResponse(response);
  } catch (err) {
    sendResponse({ success: false, error: String(err) });
  }
}
