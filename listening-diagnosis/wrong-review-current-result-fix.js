// STEP67: 현재 시험 결과 기준 오답 다시 풀기 카운트/해결 표시 보정
// 목적:
// 1) 이전 시험의 오답풀이 진행 상태가 새 진단 보고서에 섞이지 않도록 합니다.
// 2) "오답 다시 풀기 (N문항)" 숫자를 현재 result의 오답+미응답 기준으로 다시 계산합니다.
// 3) 새 시험 결과에서 남아 보이는 "오답풀이 해결" 배지를 제거합니다.
(function () {
  "use strict";

  const RESULT_KEYS = [
    "topik2_listening_last_result",
    "topik2ListeningLastResult",
    "topik2_listening_result",
    "topik2ListeningResult",
    "lastListeningResult",
    "topik_listening_result"
  ];

  function safeJsonParse(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function getStoredResult() {
    for (const key of RESULT_KEYS) {
      const parsed = safeJsonParse(localStorage.getItem(key));
      if (parsed && Array.isArray(parsed.items)) return parsed;
    }

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !/topik|listening|result/i.test(key)) continue;
      const parsed = safeJsonParse(localStorage.getItem(key));
      if (parsed && Array.isArray(parsed.items)) return parsed;
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

  function getReviewItems(result) {
    if (!result || !Array.isArray(result.items)) return [];
    return result.items
      .filter((item) => !isCorrect(item))
      .sort((a, b) => Number(a.question_number || 0) - Number(b.question_number || 0));
  }

  function makeSignature(result) {
    if (!result) return "no-result";
    return [
      result.test_name || "",
      result.generated_exam_round || "",
      result.generated_exam_label || "",
      result.started_at || "",
      result.submitted_at || "",
      result.total_questions || "",
      result.correct_count || "",
      result.unanswered_count || ""
    ].join("|").replace(/[^\w가-힣|.-]/g, "_");
  }

  function setText(el, text) {
    if (!el || el.textContent === text) return;
    el.textContent = text;
  }

  function updateWrongReviewButtons(count) {
    const wanted = `오답 다시 풀기 (${count}문항)`;

    document.querySelectorAll("button, a, [role='button']").forEach((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text.includes("오답 다시 풀기")) return;

      setText(el, wanted);
      el.setAttribute("data-current-wrong-review-count", String(count));
      el.setAttribute("data-step67-current-result-fixed", "true");
    });
  }

  function removeStaleSolvedBadges() {
    const keywords = ["오답풀이 해결", "오답 풀이 해결", "해결"];

    document.querySelectorAll("span, em, strong, b, small, label, div").forEach((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) return;

      const isSolvedBadge = keywords.some((word) => text === word || text.includes("오답풀이 해결"));
      if (!isSolvedBadge) return;

      // 카드 전체가 아니라 배지 자체만 제거합니다.
      const cls = String(el.className || "");
      if (
        text.length <= 20 ||
        /badge|tag|pill|chip|status|solved|review/i.test(cls)
      ) {
        el.remove();
      }
    });
  }

  function storeCurrentReviewState(result, reviewItems) {
    if (!result) return;

    const signature = makeSignature(result);
    const reviewNumbers = reviewItems.map((item) => Number(item.question_number));
    const payload = {
      signature,
      generated_exam_round: result.generated_exam_round || "",
      test_name: result.test_name || "",
      started_at: result.started_at || "",
      submitted_at: result.submitted_at || "",
      total_questions: result.total_questions || reviewItems.length,
      review_count: reviewItems.length,
      question_numbers: reviewNumbers,
      items: reviewItems
    };

    localStorage.setItem("topik2_wrong_review_current_signature", signature);
    localStorage.setItem("topik2_wrong_review_current_items", JSON.stringify(payload));

    // 이전 generic progress가 새 결과에 섞이지 않도록 현재 결과 기준으로 초기화합니다.
    const progressKey = `topik2_wrong_review_progress_${signature}`;
    if (!localStorage.getItem(progressKey)) {
      localStorage.setItem(progressKey, JSON.stringify({ signature, solved_numbers: [] }));
    }

    // 이전 시험용 해결 표시가 현재 화면에 섞이는 것을 막기 위해 legacy progress 키는 비웁니다.
    [
      "topik2_wrong_review_progress",
      "topik2_wrong_review_solved",
      "wrongReviewProgress",
      "wrongReviewSolved"
    ].forEach((key) => {
      if (localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify({ signature, solved_numbers: [] }));
      }
    });
  }

  function attachButtonHandler(result, reviewItems) {
    document.querySelectorAll("button, a, [role='button']").forEach((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text.includes("오답 다시 풀기")) return;
      if (el.getAttribute("data-step67-click-attached") === "true") return;

      el.setAttribute("data-step67-click-attached", "true");
      el.addEventListener("click", () => {
        storeCurrentReviewState(result, reviewItems);
      }, true);
    });
  }

  function fixOnce() {
    const result = getStoredResult();
    if (!result || !Array.isArray(result.items)) return;

    const reviewItems = getReviewItems(result);
    storeCurrentReviewState(result, reviewItems);
    updateWrongReviewButtons(reviewItems.length);
    removeStaleSolvedBadges();
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
