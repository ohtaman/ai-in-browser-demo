import { describe, it, expect } from "vitest";
import { calculateTokenSpeed, formatSystemPrompt } from "./llm_utils.js";

describe("Shared LLM Utilities", () => {
  it("calculates token speed correctly", () => {
    // 100 tokens in 2000 ms = 50.0 tok/s
    const speed = calculateTokenSpeed(100, 2000);
    expect(speed).toBe("50.0");
  });

  it("handles zero or negative duration safely", () => {
    const speed = calculateTokenSpeed(10, 0);
    expect(speed).toBe("0.0");
  });

  it("formats chat messages with system prompt", () => {
    const msgs = formatSystemPrompt("You are an assistant", "Help me");
    expect(msgs).toEqual([
      { role: "system", content: "You are an assistant" },
      { role: "user", content: "Help me" }
    ]);
  });
});
