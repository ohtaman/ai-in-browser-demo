import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkNanoAvailability, createNanoSession, runNanoPrompt, getCleanNanoSession } from "./nano_runner.js";

describe("Chrome Prompt API (Gemini Nano) - Latest Spec (Chrome 148+)", () => {

  beforeEach(() => {
    // グローバルオブジェクトのクリーンアップ
    delete globalThis.LanguageModel;
    delete globalThis.ai;
    delete window.LanguageModel;
    delete window.ai;
  });

  describe("checkNanoAvailability", () => {
    it("returns 'unsupported' when neither LanguageModel nor ai.languageModel is present", async () => {
      const result = await checkNanoAvailability();
      expect(result.status).toBe("unsupported");
      expect(result.message).toContain("LanguageModel API");
    });

    it("detects global LanguageModel with 'readily' availability", async () => {
      globalThis.LanguageModel = {
        capabilities: vi.fn().mockResolvedValue({ available: "readily" }),
        create: vi.fn(),
      };

      const result = await checkNanoAvailability();
      expect(result.status).toBe("available");
      expect(result.engine).toBe("LanguageModel");
    });

    it("detects global LanguageModel with 'after-download' status", async () => {
      globalThis.LanguageModel = {
        capabilities: vi.fn().mockResolvedValue({ available: "after-download" }),
        create: vi.fn(),
      };

      const result = await checkNanoAvailability();
      expect(result.status).toBe("downloadable");
      expect(result.engine).toBe("LanguageModel");
    });

    it("handles legacy/fallback ai.languageModel namespace", async () => {
      globalThis.ai = {
        languageModel: {
          capabilities: vi.fn().mockResolvedValue({ available: "readily" }),
          create: vi.fn(),
        },
      };

      const result = await checkNanoAvailability();
      expect(result.status).toBe("available");
      expect(result.engine).toBe("ai.languageModel");
    });
  });

  describe("createNanoSession", () => {
    it("creates session using modern LanguageModel.create with monitor support", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue("Hello"),
        promptStreaming: vi.fn(),
      };

      globalThis.LanguageModel = {
        capabilities: vi.fn().mockResolvedValue({ available: "readily" }),
        create: vi.fn().mockResolvedValue(mockSession),
      };

      const onProgress = vi.fn();
      const mockSchema = { type: "object" };
      const session = await createNanoSession({
        systemPrompt: "You are a helpful assistant",
        responseConstraint: mockSchema,
        onProgress,
      });

      expect(globalThis.LanguageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: "You are a helpful assistant",
          responseConstraint: mockSchema,
        })
      );
      expect(session).toBe(mockSession);
    });

    it("throws appropriate error when model is not available ('no')", async () => {
      globalThis.LanguageModel = {
        capabilities: vi.fn().mockResolvedValue({ available: "no" }),
        create: vi.fn(),
      };

      await expect(createNanoSession({})).rejects.toThrow("Gemini Nano は現在この端末でサポートされていません");
    });
  });

  describe("runNanoPrompt", () => {
    it("streams chunks correctly from promptStreaming with options (responseConstraint)", async () => {
      async function* mockStream() {
        yield "Hello";
        yield " world";
        yield "!";
      }

      const mockSession = {
        promptStreaming: vi.fn().mockReturnValue(mockStream()),
      };

      const chunks = [];
      const options = { responseConstraint: { type: "json-schema" } };
      const result = await runNanoPrompt(mockSession, "Hi", (chunk) => {
        chunks.push(chunk);
      }, options);

      expect(mockSession.promptStreaming).toHaveBeenCalledWith("Hi", options);
      expect(chunks).toEqual(["Hello", " world", "!"]);
      expect(result).toBe("Hello world!");
    });
  });

  describe("getCleanNanoSession", () => {
    it("uses baseSession.clone() when available", async () => {
      const clonedSession = {
        promptStreaming: vi.fn(),
        destroy: vi.fn(),
      };
      const baseSession = {
        clone: vi.fn().mockResolvedValue(clonedSession),
      };

      const session = await getCleanNanoSession(baseSession);
      expect(baseSession.clone).toHaveBeenCalled();
      expect(session).toBe(clonedSession);
    });

    it("falls back to createNanoSession when baseSession.clone() throws", async () => {
      const fallbackSession = {
        promptStreaming: vi.fn(),
      };
      globalThis.LanguageModel = {
        capabilities: vi.fn().mockResolvedValue({ available: "readily" }),
        create: vi.fn().mockResolvedValue(fallbackSession),
      };

      const baseSession = {
        clone: vi.fn().mockRejectedValue(new Error("clone not supported")),
      };

      const session = await getCleanNanoSession(baseSession, { systemPrompt: "sys" });
      expect(baseSession.clone).toHaveBeenCalled();
      expect(globalThis.LanguageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ systemPrompt: "sys" })
      );
      expect(session).toBe(fallbackSession);
    });

    it("falls back to createNanoSession when baseSession has no clone method", async () => {
      const fallbackSession = {
        promptStreaming: vi.fn(),
      };
      globalThis.LanguageModel = {
        capabilities: vi.fn().mockResolvedValue({ available: "readily" }),
        create: vi.fn().mockResolvedValue(fallbackSession),
      };

      const session = await getCleanNanoSession(null, { systemPrompt: "sys" });
      expect(globalThis.LanguageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ systemPrompt: "sys" })
      );
      expect(session).toBe(fallbackSession);
    });
  });
});

