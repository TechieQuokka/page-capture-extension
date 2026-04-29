const toggleSwitch = document.getElementById("toggleSwitch");
const btnDownload = document.getElementById("btnDownload");
const footerMsg = document.getElementById("footerMsg");

// 초기화
async function init() {
  const statusRes = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  toggleSwitch.checked = statusRes.isEnabled;
  updateUI(statusRes.isEnabled);
}

// UI 상태 업데이트
function updateUI(isEnabled) {
  if (isEnabled) {
    btnDownload.disabled = false;
    footerMsg.textContent = "버튼을 누르면 현재 페이지를 캡처합니다";
    footerMsg.className = "footer-msg";
  } else {
    btnDownload.disabled = true;
    footerMsg.textContent = "캡처가 꺼져 있습니다";
    footerMsg.className = "footer-msg off";
  }
}

// 토글 변경
toggleSwitch.addEventListener("change", async () => {
  const isEnabled = toggleSwitch.checked;
  await chrome.runtime.sendMessage({ type: "SET_STATUS", isEnabled });
  updateUI(isEnabled);
});

// 다운로드 버튼
btnDownload.addEventListener("click", async () => {
  btnDownload.disabled = true;
  btnDownload.textContent = "캡처 중...";
  footerMsg.textContent = "debugger 연결 중...";
  footerMsg.className = "footer-msg";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("탭 없음");

    const res = await chrome.runtime.sendMessage({
      type: "CAPTURE_NOW",
      tabId: tab.id
    });

    if (!res?.success) throw new Error(res?.reason || "캡처 실패");

    // MHTML -> Single HTML 변환 (restore.py 로직 이식)
    const restoredHtml = restoreMhtmlToHtml(res.mhtml);
    const blob = new Blob([restoredHtml], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);

    const safeName = (res.title || "page")
      .replace(/[^a-zA-Z0-9가-힣_\- ]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .substring(0, 50);
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const filename = `${safeName}_${ts}.html`;

    chrome.downloads.download({ url: blobUrl, filename, saveAs: false }, () => {
      URL.revokeObjectURL(blobUrl);
      btnDownload.textContent = "✓ 저장됨";
      footerMsg.textContent = "버튼을 누르면 현재 페이지를 캡처합니다";
      setTimeout(() => {
        btnDownload.textContent = "HTML 다운로드";
        btnDownload.disabled = false;
      }, 2000);
    });

  } catch (e) {
    console.error("[PageCapture]", e);
    footerMsg.textContent = `실패: ${e.message}`;
    footerMsg.className = "footer-msg off";
    btnDownload.textContent = "HTML 다운로드";
    btnDownload.disabled = false;
  }
});

/**
 * MHTML 데이터를 파싱하여 CSS와 이미지가 인라이닝된 단일 HTML로 복원합니다.
 */
function restoreMhtmlToHtml(mhtml) {
  // 1. Boundary 추출
  const boundaryMatch = mhtml.match(/boundary="?([^"\s;]+)"?/);
  if (!boundaryMatch) return mhtml;
  const boundary = boundaryMatch[1];

  // 2. 파트 분할
  const parts = mhtml.split("--" + boundary);
  let mainHtml = "";
  const resources = {};

  parts.forEach(part => {
    const headerEndIndex = part.indexOf("\r\n\r\n");
    if (headerEndIndex === -1) return;

    const headerSection = part.substring(0, headerEndIndex);
    let bodySection = part.substring(headerEndIndex + 4);
    
    // 마지막 경계의 -- 제거
    bodySection = bodySection.replace(/\r?\n--$/g, "");

    const headers = {};
    headerSection.split("\r\n").forEach(line => {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        headers[match[1].toLowerCase()] = match[2];
      }
    });

    const contentType = headers["content-type"] || "";
    const contentLocation = headers["content-location"] || "";
    const encoding = (headers["content-transfer-encoding"] || "").toLowerCase();

    let decodedBody = "";
    if (encoding === "quoted-printable") {
      decodedBody = decodeQuotedPrintable(bodySection);
    } else if (encoding === "base64") {
      decodedBody = bodySection.replace(/\s/g, ""); // Base64는 공백 제거 후 유지
    } else {
      decodedBody = bodySection;
    }

    if (contentType.includes("text/html") && !mainHtml) {
      mainHtml = decodedBody;
    } else if (contentLocation) {
      resources[contentLocation] = {
        type: contentType,
        data: decodedBody,
        encoding: encoding
      };
    }
  });

  if (!mainHtml) return mhtml;

  // 3. CSS 인라이닝
  const cssPattern = /<link[^>]+href=["']([^"']+)["'][^>]*>/g;
  mainHtml = mainHtml.replace(cssPattern, (match, href) => {
    const res = resources[href];
    if (res && res.type.includes("css")) {
      return `<style>\n/* Inlined: ${href} */\n${res.data}\n</style>`;
    }
    return match;
  });

  // 4. 이미지 인라이닝 (Data URL)
  const imgPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
  mainHtml = mainHtml.replace(imgPattern, (match, src) => {
    const res = resources[src];
    if (res && res.encoding === "base64") {
      const cleanType = res.type.split(";")[0];
      return match.replace(src, `data:${cleanType};base64,${res.data}`);
    }
    return match;
  });

  return mainHtml;
}

/**
 * Quoted-Printable 디코딩
 */
function decodeQuotedPrintable(str) {
  // 소프트 라인 브레이크 제거
  let res = str.replace(/=\r?\n/g, "");
  
  // Hex 인코딩 복구 (UTF-8 대응)
  const bytes = [];
  for (let i = 0; i < res.length; i++) {
    if (res[i] === "=" && /^[0-9A-F]{2}$/i.test(res.substr(i + 1, 2))) {
      bytes.push(parseInt(res.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(res.charCodeAt(i));
    }
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

init();
