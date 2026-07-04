// STEP12: 현재 진단 결과 기준 오답 다시 풀기 카운트 보정
// 목적:
// 1) 진단 보고서의 "오답 다시 풀기 (N문항)" 숫자와 listening-test 오답 다시 풀기 화면 총 문항 수를 일치시킵니다.
// 2) N은 세트 동반 문항 수가 아니라 현재 결과의 실제 남은 오답·미응답 문항 수입니다.
// 3) 현재 화면의 window.__TOPIK2_LAST_DIAGNOSIS_RESULT__를 최우선으로 사용해 이전 결과가 섞이지 않게 합니다.
(function () {
  "use strict";

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
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items)) return parsed;
      if (parsed && parsed.result && Array.isArray(parsed.result.items)) return parsed.result;
      if (parsed && parsed.data && Array.isArray(parsed.data.items)) return parsed.data;
      return null;
    } catch (_) {
      return null;
    }
  }

  function getStoredResult() {
    if (window.__TOPIK2_LAST_DIAGNOSIS_RESULT__ && Array.isArray(window.__TOPIK2_LAST_DIAGNOSIS_RESULT__.items)) {
      return window.__TOPIK2_LAST_DIAGNOSIS_RESULT__;
    }

    for (const storage of [localStorage, sessionStorage]) {
      for (const key of RESULT_KEYS) {
        const parsed = safeJsonParse(storage.getItem(key));
        if (parsed) return parsed;
      }

      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key || !/topik|listening|result/i.test(key)) continue;
        const parsed = safeJsonParse(storage.getItem(key));
        if (parsed) return parsed;
      }
    }

    return null;
  }

  function isAnswered(item) {
    return item && item.student_answer !== undefined && item.student_answer !== null && String(item.student_answer).trim() !== "";
  }

  function isCorrect(item) {
    if (!item) return false;
    if (item.is_correct === true) return true;
    if (!isAnswered(item)) return false;
    if (item.correct_answer === undefined || item.correct_answer === null) return false;
    return String(item.student_answer).trim() === String(item.correct_answer).trim();
  }

  function normalizeItems(result) {
    const raw = Array.isArray(result?.items) ? result.items : [];
    const out = [];
    raw.forEach((entry) => {
      if (entry && Array.isArray(entry.items)) {
        entry.items.forEach((item) => {
          out.push({
            ...item,
            set_id: item.set_id || entry.set_id || "",
            audio_url: item.audio_url || entry.audio_url || "",
            source_round: item.source_round || entry.source_round || result.generated_exam_round || ""
          });
        });
      } else if (entry) {
        out.push(entry);
      }
    });
    return out.sort((a, b) => Number(a.question_number || 0) - Number(b.question_number || 0));
  }

  function originalReviewKey(item) {
    const round = String(item?.source_round || item?.review_source_round || item?.generated_exam_round || item?.round || "103");
    const originalNumber = Number(item?.original_question_number || item?.review_source_question_number || item?.question_number || 0);
    return `${round}|${originalNumber}`;
  }

  function sourceResultId(result) {
    if (!result) return "";
    return [
      result.submitted_at || "",
      result.started_at || "",
      result.test_name || result.generated_exam_label || "",
      result.generated_exam_round || result.source_round || "",
      result.student_name || "",
      result.student_phone || "",
      result.total_questions || "",
      result.earned_points || "",
      result.correct_count || ""
    ].join("|") || "topik2-current-diagnosis";
  }

  function getProgress(result) {
    try {
      const raw = localStorage.getItem("topik2_wrong_review_progress") || sessionStorage.getItem("topik2_wrong_review_progress");
      const parsed = raw ? JSON.parse(raw) : {};
      const currentSourceId = sourceResultId(result);
      if (parsed.sourceId && currentSourceId && parsed.sourceId !== currentSourceId) {
        return { sourceId: currentSourceId, resolvedKeys: [], attempts: [] };
      }
      return {
        sourceId: parsed.sourceId || currentSourceId,
        resolvedKeys: Array.isArray(parsed.resolvedKeys) ? parsed.resolvedKeys.map(String) : [],
        attempts: Array.isArray(parsed.attempts) ? parsed.attempts : []
      };
    } catch (_) {
      return { sourceId: sourceResultId(result), resolvedKeys: [], attempts: [] };
    }
  }

  function getUnresolvedWrongItems(result) {
    const resolved = new Set(getProgress(result).resolvedKeys || []);
    return normalizeItems(result).filter((item) => {
      if (isCorrect(item)) return false;
      return !resolved.has(originalReviewKey(item));
    });
  }

  function updateWrongReviewButtons(count) {
    const wanted = count > 0 ? `오답 다시 풀기 (${count}문항)` : "오답 다시 풀기";

    document.querySelectorAll("button, a, [role='button']").forEach((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text.includes("오답 다시 풀기")) return;

      if (el.textContent !== wanted) el.textContent = wanted;
      el.disabled = count === 0;
      el.setAttribute("data-current-wrong-review-count", String(count));
      el.setAttribute("data-step12-exact-count-fixed", "true");
      el.title = count > 0 ? `현재 남은 실제 오답·미응답 ${count}문항` : "";
    });
  }

  function storeCurrentReviewState(result, reviewItems) {
    if (!result) return;
    const sourceId = sourceResultId(result);
    const progress = getProgress(result);
    progress.sourceId = sourceId;
    progress.resolvedKeys = Array.isArray(progress.resolvedKeys) ? progress.resolvedKeys : [];
    progress.attempts = Array.isArray(progress.attempts) ? progress.attempts : [];

    localStorage.setItem("topik2_wrong_review_source_id", sourceId);
    sessionStorage.setItem("topik2_wrong_review_source_id", sourceId);
    localStorage.setItem("topik2_wrong_review_progress", JSON.stringify(progress, null, 2));
    sessionStorage.setItem("topik2_wrong_review_progress", JSON.stringify(progress, null, 2));
    localStorage.setItem("topik2_wrong_review_source_result", JSON.stringify(result));
    sessionStorage.setItem("topik2_wrong_review_source_result", JSON.stringify(result));
    localStorage.setItem("topik2_wrong_review_items", JSON.stringify(reviewItems));
    sessionStorage.setItem("topik2_wrong_review_items", JSON.stringify(reviewItems));
  }

  function attachButtonHandler(result, reviewItems) {
    document.querySelectorAll("button, a, [role='button']").forEach((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text.includes("오답 다시 풀기")) return;
      if (el.getAttribute("data-step12-click-attached") === "true") return;

      el.setAttribute("data-step12-click-attached", "true");
      el.addEventListener("click", () => {
        storeCurrentReviewState(result, reviewItems);
      }, true);
    });
  }

  function fixOnce() {
    const result = getStoredResult();
    if (!result || !Array.isArray(result.items)) return;
    const reviewItems = getUnresolvedWrongItems(result);
    updateWrongReviewButtons(reviewItems.length);
    storeCurrentReviewState(result, reviewItems);
    attachButtonHandler(result, reviewItems);
  }

  let running = false;
  function scheduleFix() {
    if (running) return;
    running = true;
    setTimeout(() => {
      try {
        fixOnce();
      } finally {
        running = false;
      }
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleFix);
  } else {
    scheduleFix();
  }

  window.addEventListener("load", scheduleFix);
  setTimeout(scheduleFix, 200);
  setTimeout(scheduleFix, 800);
  setTimeout(scheduleFix, 1800);

  const observer = new MutationObserver(scheduleFix);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
