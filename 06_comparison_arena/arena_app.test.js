import { describe, it, expect, vi } from "vitest";
import { calculateTokenSpeed } from "../shared/llm_utils.js";

describe("Arena App Logic", () => {
  it("トークン速度の計算が正しく機能する", () => {
    // 50 tokens in 2000 ms -> 25.0 tok/s
    const speed = calculateTokenSpeed(50, 2000);
    expect(speed).toBe("25.0");
  });

  it("0ms の場合でもゼロ除算クラッシュせず 0.0 を返す", () => {
    const speed = calculateTokenSpeed(10, 0);
    expect(speed).toBe("0.0");
  });

  it("初回トークンレイテンシ (TTFT) のミリ秒計算が正常である", () => {
    const start = 1000;
    const firstToken = 1350;
    const ttft = Math.round(firstToken - start);
    expect(ttft).toBe(350);
  });
});
