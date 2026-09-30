/**
 * LiteRT-LM モデルローダー & ダウンロード進捗トラッキング
 * 
 * 2GBを超えるモデルのダウンロード進捗をリアルタイムに監視し、
 * OPFS / Blob URL 経由で LiteRT Engine に渡すためのモジュールです。
 */

export function formatDownloadStatus({ loadedBytes, totalBytes, speedBytesPerSec }) {
  const loadedMb = (loadedBytes / 1024 / 1024).toFixed(1);
  const speedMb = speedBytesPerSec ? (speedBytesPerSec / 1024 / 1024).toFixed(1) : "0.0";

  if (totalBytes && totalBytes > 0) {
    const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
    const percent = Math.min(100, (loadedBytes / totalBytes) * 100).toFixed(1);
    return `ダウンロード中: ${loadedMb} MB / ${totalMb} MB (${percent}%) [${speedMb} MB/s]`;
  }

  return `ダウンロード中: ${loadedMb} MB 受信済 [${speedMb} MB/s]`;
}

export function createProgressTracker(totalBytes, onProgress) {
  let loadedBytes = 0;
  let lastTimestamp = performance.now();
  let lastLoaded = 0;
  let speedBytesPerSec = 0;

  return {
    update(chunkLength) {
      loadedBytes += chunkLength;
      const now = performance.now();
      const elapsed = (now - lastTimestamp) / 1000;

      // 0.3秒ごとに速度を更新
      if (elapsed >= 0.3) {
        speedBytesPerSec = (loadedBytes - lastLoaded) / elapsed;
        lastLoaded = loadedBytes;
        lastTimestamp = now;
      }

      const percent = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;

      if (onProgress) {
        onProgress({
          loadedBytes,
          totalBytes,
          percent,
          speedBytesPerSec,
          formatted: formatDownloadStatus({ loadedBytes, totalBytes, speedBytesPerSec }),
        });
      }
    },
    getLoadedBytes() {
      return loadedBytes;
    }
  };
}

/**
 * プログレス監視付きでモデルファイルをダウンロードし、Blob URL を生成
 */
export async function downloadModelWithProgress(url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`モデルファイルの取得に失敗しました (HTTP ${response.status}: ${response.statusText})`);
  }

  const contentLength = response.headers.get("content-length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
  const tracker = createProgressTracker(totalBytes, onProgress);

  const reader = response.body.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    tracker.update(value.length);
  }

  const blob = new Blob(chunks);
  return URL.createObjectURL(blob);
}
