// STEP13: 현재 원 진단 결과 기준 오답풀이 진행률/버튼 보정
(function () {
  "use strict";

  const WRONG_REVIEW_SCOPE_VERSION = "topik2_wrong_review_current_result_v5";
  const RESULT_KEYS = [
    "topik2_listening_last_result",
    "topik2_listening_result",
    "topik2_listening_last_result_json",
    "topik2_last_result_json",
    "topik2ListeningLastResult",
    "topik2_result",
    "lastResult"
  ];

  function safeJsonParse(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function getStoredResult() {
    if (window.__TOPIK2_LAST_DIAGNOSIS_RESULT__ && Array.isArray(window.__TOPIK2_LAST_DIAGNOSIS_RESULT__.items)) {
      return window.__TOPIK2_LAST_DIAGNOSIS_RESULT__;
    }
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of RESULT_KEYS) {
        const parsed = safeJsonParse(storage.getItem(key));
        if (parsed && Array.isArray(parsed.items)) return parsed;
        if (parsed && parsed.result && Array.isArray(parsed.result.items)) return parsed.result;
        if (parsed && parsed.data && Array.isArray(parsed.data.items)) return parsed.data;
      }
    }
    return null;
  }

  function sourceResultId(result) {
    if (!result) return "";
    const explicit = result.result_id || result.exam_result_id || result.review_source_id || result.wrong_review_source_id || "";
    if (explicit) return String(explicit);
    return [
      result.submitted_at || "",
      result.started_at || "",
      result.test_name || result.generated_exam_label || "",
      result.generated_exam_mode || "",
      result.generated_exam_round || result.source_round || "",
      result.student_name || "",
      result.student_phone || "",
      result.total_questions || "",
      result.earned_points || "",
      result.correct_count || "",
      result.unanswered_count || ""
    ].join("|");
  }

  function currentWrongCount(result) {
    return Array.isArray(result?.items) ? result.items.filter((item) => !item.is_correct).length : 0;
  }

  function readProgress() {
    return safeJsonParse(localStorage.getItem("topik2_wrong_review_progress") || sessionStorage.getItem("topik2_wrong_review_progress")) || {};
  }

  function validProgress(result) {
    const progress = readProgress();
    const sid = sourceResultId(result);
    return progress &&
      progress.scopeVersion === WRONG_REVIEW_SCOPE_VERSION &&
      progress.currentResultOnly === true &&
      String(progress.sourceId || "") === String(sid || "");
  }

  function removeCardBadges() {
    document.querySelectorAll(".wrong-card .resolved-badge, .wrong-card [data-resolved-badge='true']").forEach((el) => el.remove());
    document.querySelectorAll(".wrong-card span, .wrong-card em, .wrong-card strong, .wrong-card b, .wrong-card small, .wrong-card label").forEach((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text === "오답풀이 해결" || text === "오답 풀이 해결") el.remove();
    });
  }

  function updateButton(count) {
    document.querySelectorAll("button, a, [role='button']").forEach((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text.includes("오답 다시 풀기")) return;
      el.textContent = count > 0 ? `오답 다시 풀기 (${count}문항)` : "오답 다시 풀기";
      el.disabled = count <= 0;
      el.setAttribute("data-current-wrong-review-count", String(count));
      el.setAttribute("data-step13-progress-fixed", "true");
    });
  }

  function fixOnce() {
    const result = getStoredResult();
    if (!result) return;
    removeCardBadges();
    updateButton(currentWrongCount(result));
    if (!validProgress(result)) {
      // legacy progress는 진단 카드 배지에 쓰지 않는다. 실제 오답풀이 시작 시 index.html/listening-test.js가 v5 progress를 새로 저장한다.
      const empty = {
        scopeVersion: WRONG_REVIEW_SCOPE_VERSION,
        currentResultOnly: true,
        sourceId: sourceResultId(result),
        resolvedKeys: [],
        solvedNumbers: [],
        attempts: []
      };
      localStorage.setItem("topik2_wrong_review_progress", JSON.stringify(empty, null, 2));
      sessionStorage.setItem("topik2_wrong_review_progress", JSON.stringify(empty, null, 2));
    }
  }

  let timer = null;
  function scheduleFix() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fixOnce, 60);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleFix);
  else scheduleFix();
  window.addEventListener("load", scheduleFix);
  setTimeout(scheduleFix, 200);
  setTimeout(scheduleFix, 800);
  setTimeout(scheduleFix, 1800);
  try {
    new MutationObserver(scheduleFix).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  } catch (_) {}
})();
