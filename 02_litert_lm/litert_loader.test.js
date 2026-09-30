import { describe, it, expect, vi } from "vitest";
import { formatDownloadStatus, createProgressTracker } from "./litert_loader.js";

describe("LiteRT-LM Model Loader & Progress Tracking", () => {
  it("formats progress status with MB and percentage correctly", () => {
    const status = formatDownloadStatus({
      loadedBytes: 524288000,    // 500 MB
      totalBytes: 2097152000,    // 2000 MB
      speedBytesPerSec: 10485760 // 10 MB/s
    });

    expect(status).toContain("500.0 MB");
    expect(status).toContain("2000.0 MB");
    expect(status).toContain("25.0%");
    expect(status).toContain("10.0 MB/s");
  });

  it("handles unknown total size gracefully", () => {
    const status = formatDownloadStatus({
      loadedBytes: 104857600, // 100 MB
      totalBytes: 0,
      speedBytesPerSec: 5242880 // 5 MB/s
    });

    expect(status).toContain("100.0 MB");
    expect(status).toContain("5.0 MB/s");
    expect(status).not.toContain("NaN");
  });

  it("tracks streaming progress accurately", () => {
    const onProgress = vi.fn();
    const tracker = createProgressTracker(1000, onProgress);

    tracker.update(250);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      loadedBytes: 250,
      totalBytes: 1000,
      percent: 25
    }));

    tracker.update(250);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      loadedBytes: 500,
      totalBytes: 1000,
      percent: 50
    }));
  });
});
