# AI in Browser Demo: Gemma 4 & On-Device WebGPU Showcase

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-blue.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
[![Gemma 4](https://img.shields.io/badge/Model-Gemma%204%20E2B-orange.svg)](https://huggingface.co/google/gemma-4-E2B-it)
[![Vitest](https://img.shields.io/badge/Tests-82%20passed-brightgreen.svg)](https://vitest.dev/)

> **「外部サーバー送信なし・通信転送量 0B・完全オフライン」**  
> Google Gemma 4、Chrome Gemini Nano、および自作 Multi-turn LoRA チューニングモデルを、ブラウザ上で WebGPU を用いて動かすためのオープンソース・リファレンス実装集です。

---

## 🌟 収録デモ一覧 (Demos)

本リポジトリには、最小構成の Prompt API から、自作 LoRA チューニング済み Gemma 4 を用いた本格的な現場対話型エージェントまで 5 つのデモが収録されています。

| No | ディレクトリ | タイトル | ランタイム / 基盤 | 特徴 |
|:---:|---|---|---|---|
| **00** | `00_gemini_nano/` | **Gemini Nano on Chrome** | Chrome Prompt API (Built-in AI) | ダウンロード不要・OS/ブラウザ組み込みのゼロウェイト推論 |
| **01** | `01_transformers_js/` | **Transformers.js (v3/v4)** | ONNX Runtime Web + WebGPU | Hugging Face エコシステム直結。ストリーミング生成 |
| **02** | `02_litert_lm/` | **LiteRT-LM.js** | `@litert-lm/core` + WebGPU | Google 公式オンデバイス基盤。Android/iOS/Web 共通モデル (`.litertlm`) |
| **03** | `04_custom_triage_demo/` | **災害時トリアージ判定 (一括)** | Multi-Runtime (ONNX / LiteRT / WebLLM / Nano) | 全バイタル入力から緊急度（赤・黄・緑・黒）を一括分類判定 |
| **04** | `05_interactive_triage_agent/` | **現場対話型 START トリアージ・エージェント** | Fine-Tuned Gemma 4 (Multi-turn LoRA) | 曖昧な無線報告から臨床所見を抽出し、決定木を動的ショートカット推論 |

---

## 🚀 クイックスタート (Quick Start)

### 1. 前提環境
- **Node.js**: v18 以上 (v20+ 推奨)
- **WebGPU 対応ブラウザ**: Google Chrome / Microsoft Edge / Brave (WebGPU 有効化環境)

### 2. セットアップ & 起動
```bash
git clone https://github.com/ohtaman/ai-in-browser-demo.git
cd ai-in-browser-demo

# 依存パッケージのインストール
npm install

# ローカル HTTP / HTTPS サーバー起動
npm start
```

起動後、ブラウザで以下のいずれかにアクセスしてください：
- **HTTP**: [http://localhost:8080/](http://localhost:8080/)
- **HTTPS**: [https://localhost:8443/](https://localhost:8443/) (Chrome Prompt API や一部の WebGPU セキュアコンテキスト用)

---

## 🧪 テストの実行 (Automated Testing)

全モジュール（パーサー、スキーマ、UIステートマシン、決定木対話推論ロジック、HTTPレンジサーバー）に対する 82 件のユニットテストを同梱しています。

```bash
npm test
```

---

## 🩺 注目デモ: 現場対話型 START トリアージ・エージェント

### 救急現場の実態と「なぜ if/else ではなく LLM なのか？」
大規模災害時、隊員は傷病者 1 人あたり **30秒以内** に緊急度（赤・黄・緑・黒）を判定しなければなりません（START法）。

1. **現場の報告は「自然言語の無線交信」**:
   - 隊員は選択肢ボタンを押す余裕はなく、「両足が瓦礫に挟まれ立ち上がれません」「肩で息をしていて36回あります」など口語・複合表現で報告します。
   - 固定決定木プログラム（if/else）では解釈できず、**LLM が意味理解して臨床エンティティを抽出**する必要があります。
2. **決定木の「動的ショートカット」**:
   - 複数バイタルが同時に報告された場合、下流の所見から決定木ノードを瞬時にスキップし、**最短手数（一撃）で最優先治療群(RED)や軽症(GREEN)を確定**させます。

### Multi-turn LoRA (All-Linear) の実測効果
完全未見の評価データ（62対話 / 176ターン）における客観的実測結果：

| 評価メトリクス | 未学習 (Zero-shot) | **Fine-tuned (LoRA)** | 改善幅 |
|---|:---:|:---:|:---:|
| **最終判定正解率 (Accuracy)** | 37.10% | **98.39% (61/62)** | **+61.29 pt** |
| **決定木アクション一致率 (Action)** | 68.18% | **99.43% (175/176)** | **+31.25 pt** |
| 🟢 **GREEN (即緑ショートカット)** | 0.00% | **100.00% (10/10)** | **+100.00 pt** |
| 🔴 **RED (最優先治療群)** | 22.22% | **97.22% (35/36)** | **+75.00 pt** |

> **知見**: 構文（Attention）だけでなく、医学決定木の事実関係・推論規則を定着させるには、**MLP 層（`gate, up, down`）を含めた全線形層（`all-linear`）の LoRA チューニングが不可欠**であることが実証されました。

---

## 📁 ディレクトリ構成

```text
ai-in-browser-demo/
├── index.html                   # デモポータル（全体ランチャー）
├── server.js                    # HTTP (8080) / HTTPS (8443) 静的サーバー
├── package.json                 # プロジェクト構成 & 依存定義
├── 00_gemini_nano/              # Demo 00: Chrome Prompt API
├── 01_transformers_js/          # Demo 01: Transformers.js + WebGPU
├── 02_litert_lm/                # Demo 02: LiteRT-LM.js + WebGPU
├── 03_finetune_and_export/      # ファインチューニング & ONNX / LiteRT エクスポート スクリプト
├── 04_custom_triage_demo/       # Demo 03: 災害時トリアージ一括判定
├── 05_interactive_triage_agent/ # Demo 04: 現場対話型 START トリアージ・エージェント
│   ├── dataset/                 # Train (300件) / Eval (62件) データセット生成
│   ├── training/                # Multi-turn LoRA 学習スクリプト
│   ├── evaluation/              # 定量評価ハーネス & 実測レポート
│   └── demo/                    # ブラウザ対話 UI (HTML / CSS / JS)
└── shared/                      # 共通スタイル & ユーティリティ
```

---

## 📄 ライセンス (License)

本プロジェクトは [MIT License](LICENSE) の下で公開されています。
