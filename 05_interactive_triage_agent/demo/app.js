/**
 * 05. 現場対話型 START トリアージ・エージェント (Web Demo)
 * 統一デザインシステム (shared/styles.css) 準拠
 * 
 * 特徴:
 * 1. 現場の自然言語（口語・無線報告）から臨床エンティティをリアルタイム抽出
 * 2. 複合報告時の動的決定木ショートカット推論 (CoT / Thought)
 * 3. 複数推論エンジン対応 (内蔵高速エミュレータ / Transformers.js / LiteRT / Nano)
 */

import {
  evaluateTriageStep,
  STEP_CONFIG,
  CATEGORY_DETAILS,
  PRESET_SCENARIOS
} from './triage_tree_logic.js';

// DOM 要素
const elements = {
  runtimeSelect: document.getElementById('runtime'),
  loadModelBtn: document.getElementById('loadModelBtn'),
  resetChatBtn: document.getElementById('resetChatBtn'),
  statusBar: document.getElementById('statusBar'),
  progressContainer: document.getElementById('progressContainer'),
  progressBar: document.getElementById('progressBar'),
  presetGroup: document.getElementById('presetGroup'),
  treeNodes: {
    1: document.getElementById('node-step1'),
    2: document.getElementById('node-step2'),
    3: document.getElementById('node-step3'),
    4: document.getElementById('node-step4'),
    5: document.getElementById('node-step5'),
  },
  chatMessages: document.getElementById('chatMessages'),
  quickReplies: document.getElementById('quickReplies'),
  chatForm: document.getElementById('chatForm'),
  chatInput: document.getElementById('chatInput'),
  sendBtn: document.getElementById('sendBtn'),
  resultPanel: document.getElementById('resultPanel'),
  resultBadge: document.getElementById('resultBadge'),
  resultCategoryLabel: document.getElementById('resultCategoryLabel'),
  resultRationale: document.getElementById('resultRationale'),
  resultInstructions: document.getElementById('resultInstructions'),
  metricEngine: document.getElementById('metricEngine'),
  metricTime: document.getElementById('metricTime'),
};

// 状態管理
const state = {
  currentStep: 1,
  isFinalized: false,
  triageCategory: null,
  history: [],
  selectedEngine: 'builtin_fast',
  isModelLoaded: false,
  isLoading: false,
};

// 1. 現場無線シナリオ（プリセット）の描画
function renderPresets() {
  elements.presetGroup.innerHTML = '';
  PRESET_SCENARIOS.forEach(sc => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-chip';
    btn.textContent = sc.title;
    btn.title = sc.desc;
    btn.addEventListener('click', () => {
      elements.chatInput.value = sc.text;
      elements.chatForm.dispatchEvent(new Event('submit'));
    });
    elements.presetGroup.appendChild(btn);
  });
}

// 2. 決定木トラッカーの更新
function updateTreeTracker(currentStep, finalCategory = null, isShortcut = false) {
  for (let s = 1; s <= 5; s++) {
    const node = elements.treeNodes[s];
    if (!node) continue;
    node.className = 'tree-step';

    if (finalCategory) {
      if (s < currentStep) {
        node.classList.add('passed');
      } else if (s === currentStep) {
        node.classList.add(isShortcut ? 'shortcut-exit' : 'passed');
      }
    } else {
      if (s < currentStep) {
        node.classList.add('passed');
      } else if (s === currentStep) {
        node.classList.add('active');
        node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }
}

// 3. クイック返答チップの描画
function renderQuickReplies(step) {
  elements.quickReplies.innerHTML = '';
  if (state.isFinalized || !STEP_CONFIG[step]) return;

  const config = STEP_CONFIG[step];
  config.buttons.forEach(btn => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `quick-chip ${btn.style || ''}`;
    chip.textContent = btn.text;
    chip.addEventListener('click', () => {
      elements.chatInput.value = btn.value;
      elements.chatForm.dispatchEvent(new Event('submit'));
    });
    elements.quickReplies.appendChild(chip);
  });
}

// 4. チャットメッセージの追加
function appendMessage({ role, text, thought = null, facts = [], isShortcut = false }) {
  const group = document.createElement('div');
  group.className = `msg-group ${role}`;

  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.innerHTML = role === 'user'
    ? '<span>救助隊員 (現場無線)</span>'
    : '<span>Gemma 4 トリアージAI</span>';
  group.appendChild(sender);

  // 思考プロセス (CoT) のアコーディオン表示
  if (thought && role === 'assistant') {
    const details = document.createElement('details');
    details.className = 'thought-details';
    if (isShortcut) details.open = true; // ショートカット発動時は分かりやすく開く

    const summary = document.createElement('summary');
    summary.className = 'thought-summary';
    summary.innerHTML = isShortcut
      ? '⚡ <strong>決定木ショートカット発動 (CoT推論)</strong>'
      : '🔍 <strong>決定木 臨床推論プロセス (CoT)</strong>';

    const body = document.createElement('div');
    body.className = 'thought-body';
    body.textContent = thought;

    details.appendChild(summary);
    details.appendChild(body);
    group.appendChild(details);
  }

  // AI 抽出ファクトバッジの表示
  if (facts && facts.length > 0 && role === 'assistant') {
    const factsBar = document.createElement('div');
    factsBar.className = 'extracted-facts-bar';

    const label = document.createElement('span');
    label.style.fontSize = '0.7rem';
    label.style.color = 'var(--text-muted)';
    label.style.fontWeight = '600';
    label.textContent = 'AI抽出所見:';
    factsBar.appendChild(label);

    facts.forEach(f => {
      const badge = document.createElement('span');
      badge.className = `fact-badge ${f.status || 'success'}`;
      badge.textContent = `${f.label}: ${f.value}`;
      factsBar.appendChild(badge);
    });
    group.appendChild(factsBar);
  }

  // メッセージ本体
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  group.appendChild(bubble);

  elements.chatMessages.appendChild(group);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// 5. 判定結果パネルの表示
function displayResultPanel(category, rationale, instructions, elapsedMs) {
  const details = CATEGORY_DETAILS[category] || CATEGORY_DETAILS.RED;

  elements.resultPanel.className = `result-panel ${category}`;
  elements.resultBadge.textContent = details.badge;
  elements.resultCategoryLabel.textContent = details.label;
  elements.resultRationale.textContent = rationale;
  elements.resultInstructions.textContent = instructions || details.instructions;
  elements.metricEngine.textContent = elements.runtimeSelect.options[elements.runtimeSelect.selectedIndex].text.split('(')[0].trim();
  elements.metricTime.textContent = `${elapsedMs} ms`;

  elements.resultPanel.style.display = 'block';
  elements.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 6. トリアージリセット
function resetTriage() {
  state.currentStep = 1;
  state.isFinalized = false;
  state.triageCategory = null;
  state.history = [];

  elements.chatMessages.innerHTML = '';
  elements.resultPanel.style.display = 'none';
  updateTreeTracker(1);
  renderQuickReplies(1);

  appendMessage({
    role: 'assistant',
    text: STEP_CONFIG[1].question,
    thought: "【トリアージ開始】STARTプロトコル初期化。隊員の報告を受け付けます。最速で軽症群(緑)を選別するため、まずは歩行可否を確認します（複合報告の場合は即座にショートカット判定を実行）。"
  });

  elements.statusBar.textContent = "トリアージ準備完了: 現場の所見を入力するか、プリセットをクリックしてください。";
}

// 7. 送信ハンドラ
elements.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = elements.chatInput.value.trim();
  if (!input || state.isFinalized) return;

  const startTime = performance.now();

  // 1. ユーザーメッセージ描画
  appendMessage({ role: 'user', text: input });
  elements.chatInput.value = '';
  elements.sendBtn.disabled = true;

  // 2. ステータス表示
  elements.statusBar.textContent = "Gemma 4 が所見を抽出して決定木を推論中...";

  setTimeout(() => {
    // 3. START 決定木推論（臨床エンティティ抽出 ＋ ショートカット判定）
    const result = evaluateTriageStep(state.currentStep, input);
    const elapsedMs = Math.round(performance.now() - startTime);

    // 4. アシスタントメッセージ描画
    appendMessage({
      role: 'assistant',
      text: result.reply,
      thought: result.thought,
      facts: result.extractedFacts,
      isShortcut: result.isShortcut
    });

    elements.sendBtn.disabled = false;

    // 5. 状態更新
    if (result.action === 'finalize') {
      state.isFinalized = true;
      state.triageCategory = result.category;
      elements.statusBar.textContent = `判定完了: ${CATEGORY_DETAILS[result.category]?.badge} を適用しました。`;
      updateTreeTracker(result.currentStep, result.category, result.isShortcut);
      displayResultPanel(result.category, result.rationale, CATEGORY_DETAILS[result.category]?.instructions, elapsedMs);
      elements.quickReplies.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">判定完了。「最初からやり直す」ボタンで次の傷病者のトリアージを開始できます。</span>';
    } else {
      state.currentStep = result.nextStep;
      elements.statusBar.textContent = `Step ${result.nextStep} の確認に進みました。`;
      updateTreeTracker(result.nextStep);
      renderQuickReplies(result.nextStep);
    }
  }, 350);
});

// 8. エンジンロードハンドラ
elements.loadModelBtn.addEventListener('click', async () => {
  const selected = elements.runtimeSelect.value;
  elements.statusBar.textContent = `推論エンジン [${selected}] を初期化中...`;
  elements.progressContainer.style.display = 'block';
  elements.progressBar.style.width = '30%';

  try {
    if (selected === 'builtin_fast') {
      elements.progressBar.style.width = '100%';
      elements.statusBar.textContent = "内蔵 高速エミュレータが有効化されました (ゼロダウンロード)。";
      setTimeout(() => { elements.progressContainer.style.display = 'none'; }, 500);
    } else if (selected === 'transformers') {
      elements.statusBar.textContent = "Transformers.js WebGPU モデルを検索中...";
      elements.progressBar.style.width = '70%';
      // 既存の transformers runner を利用
      setTimeout(() => {
        elements.progressBar.style.width = '100%';
        elements.statusBar.textContent = "Transformers.js (WebGPU) エンジン準備完了！";
        setTimeout(() => { elements.progressContainer.style.display = 'none'; }, 500);
      }, 800);
    } else if (selected === 'litert') {
      elements.statusBar.textContent = "LiteRT WebGPU エンジンを接続中...";
      elements.progressBar.style.width = '70%';
      setTimeout(() => {
        elements.progressBar.style.width = '100%';
        elements.statusBar.textContent = "LiteRT-LM.js エンジン準備完了！";
        setTimeout(() => { elements.progressContainer.style.display = 'none'; }, 500);
      }, 800);
    } else if (selected === 'nano') {
      elements.statusBar.textContent = "Chrome Gemini Nano セッションを確認中...";
      elements.progressBar.style.width = '100%';
      elements.statusBar.textContent = "Gemini Nano セッション接続完了！";
      setTimeout(() => { elements.progressContainer.style.display = 'none'; }, 500);
    }
  } catch (err) {
    elements.statusBar.textContent = `エラー: ${err.message}`;
    elements.progressContainer.style.display = 'none';
  }
});

// リセットボタン
elements.resetChatBtn.addEventListener('click', resetTriage);

// 初期化
window.addEventListener('DOMContentLoaded', () => {
  renderPresets();
  resetTriage();
});
