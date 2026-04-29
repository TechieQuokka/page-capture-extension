// 초기화
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("isEnabled", (result) => {
    if (result.isEnabled === undefined) {
      chrome.storage.local.set({ isEnabled: false });
    }
  });
});

// CDP 명령어 Promise 래퍼
function cdp(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "GET_STATUS") {
    chrome.storage.local.get("isEnabled", (result) => {
      sendResponse({ isEnabled: result.isEnabled ?? false });
    });
    return true;
  }

  if (message.type === "SET_STATUS") {
    chrome.storage.local.set({ isEnabled: message.isEnabled }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "CAPTURE_NOW") {
    const tabId = message.tabId;

    chrome.debugger.attach({ tabId }, "1.3", async () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, reason: chrome.runtime.lastError.message });
        return;
      }

      try {
        // Page.captureSnapshot으로 MHTML 캡처
        // CSS/이미지/폰트 전부 base64로 포함된 단일 파일
        const snapshot = await cdp(tabId, "Page.captureSnapshot", { format: "mhtml" });

        // title / url은 Runtime.evaluate로 별도 추출
        const evalResult = await cdp(tabId, "Runtime.evaluate", {
          expression: `({ url: location.href, title: document.title })`,
          returnByValue: true
        });

        const { url, title } = evalResult?.result?.value ?? { url: '', title: 'page' };

        sendResponse({ success: true, mhtml: snapshot.data, url, title });

      } catch (e) {
        sendResponse({ success: false, reason: e.message });
      } finally {
        chrome.debugger.detach({ tabId });
      }
    });

    return true;
  }

});
