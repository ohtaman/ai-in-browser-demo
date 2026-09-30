import { describe, it, expect } from "vitest";
import { parseTriageOutput, getPresetList, highlightJson } from "./triage_parser.js";

describe("Triage Parser & Preset Logic", () => {
  it("parses valid JSON with RED category", () => {
    const raw = JSON.stringify({
      triage_category: "RED",
      priority: "最優先治療群",
      immediate_action: "気道確保"
    });

    const result = parseTriageOutput(raw);
    expect(result.category).toBe("RED");
    expect(result.className).toBe("triage-tag-display tag-red");
    expect(result.label).toContain("RED");
  });

  it("parses valid JSON with YELLOW category", () => {
    const raw = JSON.stringify({
      triage_category: "YELLOW",
      priority: "待機的治療群"
    });

    const result = parseTriageOutput(raw);
    expect(result.category).toBe("YELLOW");
    expect(result.className).toBe("triage-tag-display tag-yellow");
  });

  it("parses valid JSON with GREEN category", () => {
    const raw = JSON.stringify({
      triage_category: "GREEN",
      priority: "軽症保留群"
    });

    const result = parseTriageOutput(raw);
    expect(result.category).toBe("GREEN");
    expect(result.className).toBe("triage-tag-display tag-green");
  });

  it("parses valid JSON with BLACK category", () => {
    const raw = JSON.stringify({
      triage_category: "BLACK",
      priority: "不処置群"
    });

    const result = parseTriageOutput(raw);
    expect(result.category).toBe("BLACK");
    expect(result.className).toBe("triage-tag-display tag-black");
  });

  it("rejects markdown code block without silent stripping (proves need for constrained decoding)", () => {
    const markdown = '```json\n{\n  "triage_category": "RED"\n}\n```';
    const result = parseTriageOutput(markdown);
    expect(result.category).toBe("NONE");
    expect(result.label).toBe("生成中...");
  });

  it("does not guess categories from raw text fragments when JSON syntax is incomplete", () => {
    const streamFragment = '判定結果は以下の通りです: {"triage_category": "RED"';
    const result = parseTriageOutput(streamFragment);
    expect(result.category).toBe("NONE");
    expect(result.label).toBe("生成中...");
  });

  it("returns none when input is plain text or empty", () => {
    const result = parseTriageOutput("まだ判定中...");
    expect(result.category).toBe("NONE");
    expect(result.className).toBe("triage-tag-display tag-none");
    expect(parseTriageOutput("").category).toBe("NONE");
    expect(parseTriageOutput(null).category).toBe("NONE");
  });

  it("never returns empty formattedJson when raw input has content", () => {
    const malformed = "```json\n```\n自力歩行不可。呼吸数36回/分";
    const result = parseTriageOutput(malformed);
    expect(result.formattedJson).toBeTruthy();
    expect(result.formattedJson.length).toBeGreaterThan(0);
  });

  it("faithfully reports unknown category without silent rewriting", () => {
    const hallucinated = JSON.stringify({
      judgment_reason: "呼吸数36回/分",
      triage_category: "ORANGE",
      vital_assessment: {
        walkable: false,
        respiratory_rate: 36,
        radial_pulse: "weak",
        obeys_commands: false
      }
    });
    const result = parseTriageOutput(hallucinated);
    expect(result.category).toBe("UNKNOWN");
    expect(result.className).toBe("triage-tag-display tag-none");
    expect(result.label).toContain("不明カテゴリ");
    expect(result.label).toContain("ORANGE");
  });

  it("does not silently normalize non-enum Japanese category names like '赤' into RED", () => {
    const raw = JSON.stringify({
      judgment_reason: "自力歩行不能かつ頻呼吸",
      triage_category: "赤"
    });
    const result = parseTriageOutput(raw);
    expect(result.category).toBe("UNKNOWN");
    expect(result.label).toContain("赤");
  });

  describe("highlightJson", () => {
    it("highlights keys, string values, numbers, booleans, and null", () => {
      const sample = JSON.stringify({
        triage_category: "RED",
        age: 45,
        walkable: false,
        notes: null
      }, null, 2);

      const html = highlightJson(sample);
      expect(html).toContain('<span class="json-key">"triage_category"</span>:');
      expect(html).toContain('<span class="json-string">"RED"</span>');
      expect(html).toContain('<span class="json-key">"age"</span>:');
      expect(html).toContain('<span class="json-number">45</span>');
      expect(html).toContain('<span class="json-key">"walkable"</span>:');
      expect(html).toContain('<span class="json-boolean">false</span>');
      expect(html).toContain('<span class="json-key">"notes"</span>:');
      expect(html).toContain('<span class="json-null">null</span>');
    });

    it("escapes raw HTML to prevent injection", () => {
      const dangerous = JSON.stringify({
        alert: "<script>alert('xss')</script>",
        formula: "a < b && c > d"
      });
      const html = highlightJson(dangerous);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&amp;&amp;");
    });

    it("handles empty or non-string input safely", () => {
      expect(highlightJson("")).toBe("");
      expect(highlightJson(null)).toBe("");
      expect(highlightJson(undefined)).toBe("");
    });
  });

  it("provides 4 preset cases with accurate START triage definitions", () => {
    const presets = getPresetList();
    expect(presets).toHaveProperty("red");
    expect(presets).toHaveProperty("yellow");
    expect(presets).toHaveProperty("green");
    expect(presets).toHaveProperty("black");
    expect(presets.red).toContain("36回/分");
    expect(presets.yellow).toContain("20回/分");
  });
});
