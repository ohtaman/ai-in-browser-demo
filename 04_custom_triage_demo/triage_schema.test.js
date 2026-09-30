import { describe, it, expect } from "vitest";
import { 
  TRIAGE_JSON_SCHEMA, 
  TRIAGE_ALLOWED_CATEGORIES, 
  TRIAGE_SYSTEM_PROMPT,
  validateTriageCategory, 
  createTriageConstraintProcessor
} from "./triage_schema.js";

describe("Triage Schema & Constrained Decoding Helper (CoT-first)", () => {
  it("defines standard JSON schema with judgment_reason placed before triage_category for CoT", () => {
    expect(TRIAGE_JSON_SCHEMA.type).toBe("object");
    const propertyKeys = Object.keys(TRIAGE_JSON_SCHEMA.properties);
    
    // CoT (Chain-of-Thought) requires reasoning to precede final categorical decision
    expect(propertyKeys[0]).toBe("judgment_reason");
    const reasonIndex = propertyKeys.indexOf("judgment_reason");
    const categoryIndex = propertyKeys.indexOf("triage_category");
    expect(reasonIndex).toBeLessThan(categoryIndex);

    expect(TRIAGE_JSON_SCHEMA.properties.triage_category.enum).toEqual([
      "RED", "YELLOW", "GREEN", "BLACK"
    ]);
    expect(TRIAGE_ALLOWED_CATEGORIES).toContain("RED");
    expect(TRIAGE_ALLOWED_CATEGORIES).toContain("YELLOW");
    expect(TRIAGE_ALLOWED_CATEGORIES).toContain("GREEN");
    expect(TRIAGE_ALLOWED_CATEGORIES).toContain("BLACK");
  });

  it("ensures TRIAGE_SYSTEM_PROMPT instructs model to output judgment_reason first", () => {
    expect(TRIAGE_SYSTEM_PROMPT).toContain("judgment_reason");
    expect(TRIAGE_SYSTEM_PROMPT).toContain("triage_category");
    const reasonPos = TRIAGE_SYSTEM_PROMPT.indexOf("judgment_reason");
    const catPos = TRIAGE_SYSTEM_PROMPT.indexOf("triage_category");
    expect(reasonPos).toBeLessThan(catPos);
  });

  it("does not embed TypeScript types in TRIAGE_SYSTEM_PROMPT so free generation remains unconstrained", () => {
    expect(TRIAGE_SYSTEM_PROMPT).not.toContain("type TriageOutput");
    expect(TRIAGE_SYSTEM_PROMPT).not.toContain("interface");
  });

  describe("validateTriageCategory", () => {
    it("returns true for exact allowed categories", () => {
      expect(validateTriageCategory("RED")).toBe(true);
      expect(validateTriageCategory("YELLOW")).toBe(true);
      expect(validateTriageCategory("GREEN")).toBe(true);
      expect(validateTriageCategory("BLACK")).toBe(true);
    });

    it("rejects invalid or hallucinated categories", () => {
      expect(validateTriageCategory("ORANGE")).toBe(false);
      expect(validateTriageCategory("PURPLE")).toBe(false);
      expect(validateTriageCategory("UNKNOWN")).toBe(false);
      expect(validateTriageCategory("")).toBe(false);
      expect(validateTriageCategory(null)).toBe(false);
    });
  });

  describe("createTriageConstraintProcessor", () => {
    it("instantiates processor with json_schema format adhering to CoT order", () => {
      class MockProcessor {
        constructor(tokenizer, format) {
          this.tokenizer = tokenizer;
          this.format = format;
        }
      }
      const mockTokenizer = { vocab: {} };
      const processor = createTriageConstraintProcessor(mockTokenizer, MockProcessor);
      expect(processor.format.type).toBe("json_schema");
      const keys = Object.keys(processor.format.json_schema.properties);
      expect(keys[0]).toBe("judgment_reason");
      expect(processor.format.json_schema.properties.triage_category.enum).toEqual([
        "RED", "YELLOW", "GREEN", "BLACK"
      ]);
    });
  });
});
