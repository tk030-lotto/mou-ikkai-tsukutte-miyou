/**
 * もう一回作ってみよう。ツール - Application Logic
 * Protocol Article 18 Standard: Zero-Dependency, Robust State Management,
 * Prompt Generation Engine, Local Draft Persistence, Accessible UI Feedback.
 */

(() => {
  'use strict';

  // ==========================================================================
  // 1. Constants & Configurations
  // ==========================================================================

  const STORAGE_KEY = 'mou_ikkai_tool_draft_v1';

  const MODIFIER_TEMPLATES = {
    'simple': '【追加要望】複雑な機能は捨て、とにかく一番シンプルで軽量な構成で作り直す方針を優先してください。',
    'keep-design': '【追加要望】HTMLの構造やCSSデザイン（見た目）は気に入っているため極力残し、ロジック・スクリプト部分を中心に整理・修正してください。',
    'core-only': '【追加要望】最も重要なコア機能1点だけに絞り込み、副次的な機能は一旦すべて除外してください。',
    'repair-first': '【追加要望】可能であれば作り直さず、現在のコードのどこをどう修正すれば動くようになるかの手順を最優先で提示してください。',
    'scratch-ok': '【追加要望】中途半端に修正するより、最初からクリーンに作り直した方が早ければ、遠慮なくゼロベースの再構築プランを提示してください。'
  };

  // ==========================================================================
  // 2. Application State
  // ==========================================================================

  const state = {
    currentView: 'welcome', // 'welcome' | 'form' | 'result'
    inputs: {
      project: '',
      problem: '',
      goal: ''
    },
    activeModifiers: new Set(),
    generatedPrompt: '',
    isCustomEdited: false
  };

  // Timer Lifecycle Management
  let focusTimer = null;
  const copyButtonTimers = new WeakMap();
  let toastTimer = null;
  let toastRemoveTimer = null;

  // ==========================================================================
  // 3. DOM Elements Cache
  // ==========================================================================

  const dom = {
    views: {
      welcome: document.getElementById('welcome-view'),
      form: document.getElementById('form-view'),
      result: document.getElementById('result-view')
    },
    brandLogo: document.getElementById('brand-logo'),
    btnStart: document.getElementById('btn-start'),
    btnBackToWelcome: document.getElementById('btn-back-to-welcome'),
    btnClearDraft: document.getElementById('btn-clear-draft'),
    btnGenerate: document.getElementById('btn-generate'),
    form: document.getElementById('restart-form'),
    formError: document.getElementById('form-error-msg'),
    inputs: {
      project: document.getElementById('input-project'),
      problem: document.getElementById('input-problem'),
      goal: document.getElementById('input-goal')
    },
    stepItems: document.querySelectorAll('.step-item'),
    promptContent: document.getElementById('prompt-content'),
    promptStats: document.getElementById('prompt-stats'),
    btnResetPrompt: document.getElementById('btn-reset-prompt'),
    btnCopyTop: document.getElementById('btn-copy-top'),
    btnCopyBottom: document.getElementById('btn-copy-bottom'),
    btnEditInputs: document.getElementById('btn-edit-inputs'),
    btnRestartAll: document.getElementById('btn-restart-all'),
    adjChips: document.querySelectorAll('.adj-chip'),
    toastContainer: document.getElementById('toast-container')
  };

  // ==========================================================================
  // 4. View & Navigation Management
  // ==========================================================================

  /**
   * Switch active view with smooth animation and accessible focus management
   * @param {'welcome' | 'form' | 'result'} targetView
   */
  function switchView(targetView) {
    if (!dom.views[targetView]) return;

    state.currentView = targetView;

    Object.entries(dom.views).forEach(([viewName, el]) => {
      if (viewName === targetView) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (targetView === 'welcome') {
      const heading = dom.views.welcome.querySelector('.hero-headline');
      if (heading) heading.focus();
    } else if (targetView === 'form') {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => dom.inputs.project.focus(), 150);
      updateStepProgress();
    } else if (targetView === 'result') {
      const heading = dom.views.result.querySelector('.result-title');
      if (heading) heading.focus();
    }
  }

  /**
   * Update form step progress indicators based on input states
   */
  function updateStepProgress() {
    const hasProject = dom.inputs.project.value.trim().length > 0;
    const hasProblem = dom.inputs.problem.value.trim().length > 0;
    const hasGoal = dom.inputs.goal.value.trim().length > 0;

    let activeStepLevel = 1;
    if (hasProject) activeStepLevel = 2;
    if (hasProblem) activeStepLevel = 3;
    if (hasGoal && activeStepLevel < 3) activeStepLevel = 3;

    dom.stepItems.forEach(item => {
      const stepNum = parseInt(item.dataset.step, 10);
      if (stepNum <= activeStepLevel) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // ==========================================================================
  // 5. Prompt Generation Engine
  // ==========================================================================

  /**
   * Build the structured AI restart prompt
   * @returns {string}
   */
  function buildPrompt() {
    const projectText = state.inputs.project.trim() || '（未入力）';
    const problemText = state.inputs.problem.trim() || '（未入力）';
    const goalText = state.inputs.goal.trim() || '（未入力）';

    let modifiersText = '';
    if (state.activeModifiers.size > 0) {
      const modItems = Array.from(state.activeModifiers)
        .map(modKey => MODIFIER_TEMPLATES[modKey])
        .filter(Boolean)
        .join('\n');
      modifiersText = `\n■ 5. 個別の要望・重視したい点\n${modItems}\n`;
    }

    return `【AI開発リスタート相談】
現在開発中のプロジェクトで行き詰まっており、現在の状態を整理して「修正して続けるか、作り直すか」を判断したいため、客観的なアドバイスをお願いします。

■ 1. 作っていたもの（プロジェクト概要）
${projectText}

■ 2. 何がうまくいかなかったか（問題点・現状）
${problemText}

■ 3. 本当は何を作りたかったか（当初の目的・核となるゴール）
${goalText}

■ 4. AIにお願いしたい検討内容
以下の4つの選択肢を比較検討し、最も効率的かつ現実的な再開方針を提案してください。
【選択肢A】現在のコードを修正して続ける（問題箇所のピンポイント修正手順）
【選択肢B】一部の機能だけを作り直す（不具合箇所の特定と再実装方針）
【選択肢C】機能を削ぎ落としてシンプルに戻す（余計なものを削り当初の目的に戻す）
【選択肢D】最初からゼロベースで作り直す（推奨ファイル構成と最小限の実装ステップ）
${modifiersText}
まずは「どの選択肢（A〜D）が一番おすすめか」の結論と、その理由を分かりやすく教えてください。`;
  }

  /**
   * Render the prompt to the prompt editor card
   */
  function renderPrompt() {
    if (!state.isCustomEdited) {
      state.generatedPrompt = buildPrompt();
      dom.promptContent.innerText = state.generatedPrompt;
    }
    updatePromptStats();
  }

  /**
   * Update character stats display
   */
  function updatePromptStats() {
    const text = dom.promptContent.innerText || '';
    dom.promptStats.textContent = `${text.length} 文字`;
  }

  // ==========================================================================
  // 6. Draft Storage Management (localStorage)
  // ==========================================================================

  function saveDraft() {
    const draftData = {
      project: dom.inputs.project.value,
      problem: dom.inputs.problem.value,
      goal: dom.inputs.goal.value,
      savedAt: Date.now()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draftData));
    } catch (e) {
      console.warn('Draft save failed:', e);
    }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.project) dom.inputs.project.value = draft.project;
      if (draft.problem) dom.inputs.problem.value = draft.problem;
      if (draft.goal) dom.inputs.goal.value = draft.goal;
      state.inputs.project = draft.project || '';
      state.inputs.problem = draft.problem || '';
      state.inputs.goal = draft.goal || '';
    } catch (e) {
      console.warn('Draft load failed:', e);
    }
  }

  function clearDraft(skipConfirm = false) {
    if (!skipConfirm && (dom.inputs.project.value || dom.inputs.problem.value || dom.inputs.goal.value)) {
      if (!confirm('入力中の下書きをすべて消去しますか？')) return;
    }
    dom.inputs.project.value = '';
    dom.inputs.problem.value = '';
    dom.inputs.goal.value = '';
    state.inputs.project = '';
    state.inputs.problem = '';
    state.inputs.goal = '';
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    updateStepProgress();
    showToast('下書きをクリアしました');
  }

  // ==========================================================================
  // 7. Clipboard & Toast Notifications
  // ==========================================================================

  /**
   * Copy text to clipboard with modern API and fallback
   * @param {string} text
   * @param {HTMLElement} triggerBtn
   */
  async function copyToClipboard(text, triggerBtn) {
    let success = false;

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch (err) {
        console.warn('navigator.clipboard failed, trying fallback:', err);
      }
    }

    if (!success) {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        success = document.execCommand('copy');
      } catch (err) {
        console.error('execCommand copy failed:', err);
      }
      document.body.removeChild(textarea);
    }

    if (success) {
      showToast('質問文をクリップボードにコピーしました！AIチャットに貼り付けてください');
      animateCopyButton(triggerBtn);
    } else {
      showToast('コピーに失敗しました。手動で選択してコピーしてください', 'error');
    }
  }

  /**
   * Micro-animation for copy button with independent timer lifecycle per button
   * @param {HTMLElement} btn
   */
  function animateCopyButton(btn) {
    if (!btn) return;
    if (copyButtonTimers.has(btn)) {
      clearTimeout(copyButtonTimers.get(btn));
    }
    const textEl = btn.querySelector('.btn-text');
    const originalText = textEl ? (textEl.dataset.originalText || textEl.textContent) : btn.textContent;
    if (textEl && !textEl.dataset.originalText) {
      textEl.dataset.originalText = originalText;
    }
    btn.classList.add('copied');
    if (textEl) {
      textEl.textContent = 'コピー完了！';
    }
    const timer = setTimeout(() => {
      btn.classList.remove('copied');
      if (textEl) {
        textEl.textContent = textEl.dataset.originalText || originalText;
      }
      copyButtonTimers.delete(btn);
    }, 2000);
    copyButtonTimers.set(btn, timer);
  }

  /**
   * Display toast notification with safe DOM construction
   * @param {string} message
   * @param {'success' | 'error'} type
   */
  function showToast(message, type = 'success') {
    if (toastTimer) clearTimeout(toastTimer);
    if (toastRemoveTimer) clearTimeout(toastRemoveTimer);

    // Remove any existing toasts
    dom.toastContainer.innerHTML = '';

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
    
    const iconSvg = type === 'error'
      ? `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
      : `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

    const span = document.createElement('span');
    span.textContent = message;

    toast.innerHTML = iconSvg;
    toast.appendChild(span);
    dom.toastContainer.appendChild(toast);

    toastTimer = setTimeout(() => {
      toast.classList.add('hiding');
      toastRemoveTimer = setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3500);
  }

  // ==========================================================================
  // 8. Event Handlers & Interactions
  // ==========================================================================

  function handleFormSubmit() {
    const projectVal = dom.inputs.project.value.trim();
    const problemVal = dom.inputs.problem.value.trim();
    const goalVal = dom.inputs.goal.value.trim();

    // Validation: at least one of the fields should be filled
    if (!projectVal && !problemVal && !goalVal) {
      showFormError('少なくとも1つ以上の項目（作っていたもの、困っていること、または当初の目的）を入力してください');
      dom.inputs.project.focus();
      return;
    }

    hideFormError();

    state.inputs.project = projectVal;
    state.inputs.problem = problemVal;
    state.inputs.goal = goalVal;
    state.isCustomEdited = false;

    saveDraft();
    renderPrompt();
    switchView('result');
  }

  function showFormError(msg) {
    dom.formError.textContent = msg;
    dom.formError.style.display = 'block';
  }

  function hideFormError() {
    dom.formError.style.display = 'none';
  }

  // Quick Chips in Form
  function setupChipHandlers() {
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const parentGroup = chip.closest('.chip-group');
        const targetId = parentGroup ? parentGroup.dataset.target : null;
        if (!targetId) return;

        const targetInput = document.getElementById(targetId);
        if (!targetInput) return;

        const chipText = chip.textContent.trim();
        const currentVal = targetInput.value.trim();

        if (currentVal.length === 0) {
          targetInput.value = chipText;
        } else if (!currentVal.includes(chipText)) {
          targetInput.value = `${currentVal} / ${chipText}`;
        }

        saveDraft();
        updateStepProgress();
        targetInput.focus();
      });
    });
  }

  // Quick Adjustment Chips in Result View
  function setupAdjustmentHandlers() {
    dom.adjChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const modKey = chip.dataset.modifier;
        if (!modKey) return;

        if (state.activeModifiers.has(modKey)) {
          state.activeModifiers.delete(modKey);
          chip.classList.remove('active');
        } else {
          state.activeModifiers.add(modKey);
          chip.classList.add('active');
        }

        state.isCustomEdited = false;
        renderPrompt();
      });
    });
  }

  // ==========================================================================
  // 9. Initialization
  // ==========================================================================

  function init() {
    loadDraft();
    setupChipHandlers();
    setupAdjustmentHandlers();

    // Navigation Events
    dom.brandLogo.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('welcome');
    });

    dom.btnStart.addEventListener('click', () => switchView('form'));
    dom.btnBackToWelcome.addEventListener('click', () => switchView('welcome'));
    dom.btnClearDraft.addEventListener('click', clearDraft);
    dom.btnGenerate.addEventListener('click', handleFormSubmit);

    // Form inputs auto-save & step progress update
    Object.values(dom.inputs).forEach(inputEl => {
      inputEl.addEventListener('input', () => {
        saveDraft();
        updateStepProgress();
        hideFormError();
      });
      // Keyboard shortcut: Ctrl/Cmd + Enter to submit
      inputEl.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          handleFormSubmit();
        }
      });
    });

    // Prompt Editor Direct Input & Paste Control
    dom.promptContent.addEventListener('input', () => {
      state.isCustomEdited = true;
      updatePromptStats();
    });

    dom.promptContent.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      selection.deleteFromDocument();
      const textNode = document.createTextNode(text);
      selection.getRangeAt(0).insertNode(textNode);
      selection.collapseToEnd();
      state.isCustomEdited = true;
      updatePromptStats();
    });

    // Reset prompt button
    dom.btnResetPrompt.addEventListener('click', () => {
      state.isCustomEdited = false;
      state.activeModifiers.clear();
      dom.adjChips.forEach(c => c.classList.remove('active'));
      renderPrompt();
      showToast('質問文を初期生成時の内容にリセットしました');
    });

    // Copy Buttons
    dom.btnCopyTop.addEventListener('click', () => {
      const text = dom.promptContent.innerText;
      copyToClipboard(text, dom.btnCopyTop);
    });

    dom.btnCopyBottom.addEventListener('click', () => {
      const text = dom.promptContent.innerText;
      copyToClipboard(text, dom.btnCopyBottom);
    });

    // Result Action Buttons
    dom.btnEditInputs.addEventListener('click', () => switchView('form'));
    dom.btnRestartAll.addEventListener('click', () => {
      if (confirm('最初からやり直しますか？（入力した下書きもリセットされます）')) {
        clearDraft(true);
        state.activeModifiers.clear();
        dom.adjChips.forEach(c => c.classList.remove('active'));
        state.isCustomEdited = false;
        switchView('welcome');
      }
    });

    // Initialize step progress
    updateStepProgress();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
