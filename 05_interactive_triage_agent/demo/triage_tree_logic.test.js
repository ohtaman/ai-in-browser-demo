import { describe, it, expect } from 'vitest';
import {
  evaluateTriageStep,
  extractClinicalEntities,
  STEP_CONFIG,
  CATEGORY_DETAILS,
  PRESET_SCENARIOS
} from './triage_tree_logic.js';

describe('START Interactive Triage Agent - Decision Tree & Entity Extraction Logic', () => {
  describe('Clinical Entity Extraction (自然言語からの臨床所見抽出)', () => {
    it('extracts walking inability from colloquial injury report', () => {
      const res = extractClinicalEntities('両足を瓦礫に挟まれて立ち上がれません！動けません。');
      expect(res.walking).toBe('cannot_walk');
      expect(res.facts.some(f => f.key === 'walking' && f.status === 'danger')).toBe(true);
    });

    it('extracts walking ability from colloquial expression', () => {
      const res = extractClinicalEntities('頭から出血がありますが、自分でスタスタ歩いて救護所まで来られました。');
      expect(res.walking).toBe('can_walk');
      expect(res.facts.some(f => f.key === 'walking' && f.status === 'success')).toBe(true);
    });

    it('extracts airway resumption correctly', () => {
      const res = extractClinicalEntities('頭部後屈顎先挙上で気道確保したら大きく息を吸い込み始めました！');
      expect(res.breathing).toBe('resumed_airway');
    });

    it('extracts persistent apnea after airway maneuver', () => {
      const res = extractClinicalEntities('気道確保を行いましたが自発呼吸は全く再開しません。');
      expect(res.breathing).toBe('none_after_airway');
    });

    it('extracts tachypneic rate (>=30 /min) without misinterpreting 1分間', () => {
      const res = extractClinicalEntities('呼吸数が1分間に36回と異常に速く肩呼吸をしています');
      expect(res.rateValue).toBe(36);
      expect(res.rateStatus).toBe('abnormal');
    });

    it('extracts circulatory failure from weak/absent pulse or prolonged CRT', () => {
      const res = extractClinicalEntities('手首が冷たくなっており橈骨動脈の脈が取れません。爪床圧迫も3秒以上かかります。');
      expect(res.circulation).toBe('failed');
    });

    it('extracts mental status obeying commands vs inability', () => {
      const res1 = extractClinicalEntities('「手を握ってください」の指示に問題なく応じられます。');
      expect(res1.mental).toBe('can_obey');

      const res2 = extractClinicalEntities('呼びかけても呻くのみで目を開けず、こちらの言っていることが通じていません。');
      expect(res2.mental).toBe('cannot_obey');
    });
  });

  describe('Dynamic Multi-Node Shortcut (AIならではの複合発話ショートカット)', () => {
    it('immediately finalizes RED when user reports walking inability + tachypnea simultaneously', () => {
      // Step 1 にいる時点で、ユーザーが「歩けない、呼吸も36回」と報告した場合
      const result = evaluateTriageStep(1, '倒壊家屋から救出。両足を挟まれ自力歩行不可！呼吸が1分間に36回と異常に荒いです！');
      expect(result.action).toBe('finalize');
      expect(result.category).toBe('RED');
      expect(result.isShortcut).toBe(true);
      expect(result.thought).toContain('急性換気不全');
      expect(result.extractedFacts.length).toBeGreaterThanOrEqual(2);
    });

    it('immediately finalizes RED when airway maneuver successfully resumes breathing', () => {
      const result = evaluateTriageStep(1, '息をしていませんでしたが、気道確保したら大きく息を吸い込み始めました！');
      expect(result.action).toBe('finalize');
      expect(result.category).toBe('RED');
      expect(result.thought).toContain('気道閉塞リスク');
    });

    it('immediately finalizes BLACK when apnea persists after airway opening', () => {
      const result = evaluateTriageStep(1, '気道確保後も呼吸が全く再開しません。息をしておらず心肺停止です。');
      expect(result.action).toBe('finalize');
      expect(result.category).toBe('BLACK');
    });

    it('immediately finalizes YELLOW when comprehensive stable vitals are reported at once', () => {
      const result = evaluateTriageStep(1, '骨盤骨折で立ち上がれませんが、呼吸数は18回、手首の脈拍しっかり触れ、手を握る指示にも問題なく応じられます。');
      expect(result.action).toBe('finalize');
      expect(result.category).toBe('YELLOW');
      expect(result.rationale).toContain('待機的治療群');
    });
  });

  describe('Standard Step-by-Step Flow (順次質問フロー)', () => {
    it('Step 1 walking failure leads to asking Step 2 breathing', () => {
      const result = evaluateTriageStep(1, '歩行できません。倒れたままで自力移動は不可能です。');
      expect(result.action).toBe('ask');
      expect(result.nextStep).toBe(2);
      expect(result.reply).toContain('自発呼吸の有無');
    });

    it('Step 2 normal breathing leads to asking Step 3 rate', () => {
      const result = evaluateTriageStep(2, '自発呼吸があります。胸が上下して息をしています。');
      expect(result.action).toBe('ask');
      expect(result.nextStep).toBe(3);
      expect(result.reply).toContain('1分間の呼吸数');
    });

    it('Step 3 normal rate leads to asking Step 4 circulation', () => {
      const result = evaluateTriageStep(3, '呼吸数は1分間に18回で、正常範囲内です。');
      expect(result.action).toBe('ask');
      expect(result.nextStep).toBe(4);
      expect(result.reply).toContain('循環動態');
    });

    it('Step 4 good circulation leads to asking Step 5 mental status', () => {
      const result = evaluateTriageStep(4, '手首の橈骨動脈を明瞭に触知できます。CRTも1.5秒で良好です。');
      expect(result.action).toBe('ask');
      expect(result.nextStep).toBe(5);
      expect(result.reply).toContain('意識・簡単な従命反応');
    });

    it('Step 5 obeying commands leads to YELLOW finalization', () => {
      const result = evaluateTriageStep(5, '「手を握ってください」の指示を理解し、しっかりと握り返すことができます。');
      expect(result.action).toBe('finalize');
      expect(result.category).toBe('YELLOW');
    });
  });

  describe('Preset Scenarios Integrity', () => {
    it('contains all 6 realistic disaster communication presets', () => {
      expect(PRESET_SCENARIOS.length).toBe(6);
      PRESET_SCENARIOS.forEach(p => {
        expect(p.id).toBeTruthy();
        expect(p.title).toBeTruthy();
        expect(p.text).toBeTruthy();
        expect(p.desc).toBeTruthy();
      });
    });
  });
});
