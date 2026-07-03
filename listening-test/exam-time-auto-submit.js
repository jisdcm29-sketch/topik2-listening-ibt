(function () {
  "use strict";

  if (window.__topikTimeAutoSubmitHookInstalled) return;
  window.__topikTimeAutoSubmitHookInstalled = true;

  let lastExam = null;
  let active = false;
  let submitted = false;
  let deadline = 0;
  let timerId = null;

  const originalFetch = window.fetch;
  window.fetch = async function () {
    const response = await originalFetch.apply(this, arguments);
    try {
      const rawUrl = arguments[0];
      const url = typeof rawUrl === "string" ? rawUrl : (rawUrl && rawUrl.url) || "";
      if (/\/?data\/exams\/.+\.json(?:[?#].*)?$/i.test(url)) {
        response.clone().json().then((data) => {
          if (data && data.section === "listening" && data.exam_id) {
            lastExam = data;
          }
        }).catch(() => {});
      }
    } catch (error) {
      // fetch 감시 실패는 시험 진행을 막지 않는다.
    }
    return response;
  };

  function minutesToText(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function getExamScreen() {
    return document.getElementById("examScreen");
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function isExamRunning() {
    return isVisible(getExamScreen());
  }

  function getLimitMinutes() {
    if (lastExam && Number(lastExam.time_limit_minutes) > 0) {
      return Number(lastExam.time_limit_minutes);
    }

    const meta = (document.getElementById("examMeta")?.textContent || "") +
      " " + (document.getElementById("examTitle")?.textContent || "");

    if (/응답\s*\d+\s*\/\s*50/.test(meta) || /50문항|1~50|랜덤/.test(meta)) return 60;
    if (/응답\s*\d+\s*\/\s*30/.test(meta) || /30문항|레벨/.test(meta)) return 30;

    return 0;
  }

  function findSubmitButton() {
    return document.getElementById("submitBtnBottom") ||
      document.getElementById("submitBtnTop") ||
      document.querySelector("button[data-submit], button.submit-btn, .submit-btn button");
  }

  function updateTimerText(ms) {
    const text = minutesToText(ms);
    [
      "remainingTime",
      "timeRemaining",
      "timerText",
      "examTimer",
      "countdownTimer",
      "timer",
      "remainingTimeText"
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    });

    document.querySelectorAll("[data-topik-time-remaining]").forEach((el) => {
      el.textContent = text;
    });
  }

  function submitByTimeEnd() {
    if (submitted) return;
    submitted = true;

    const btn = findSubmitButton();
    if (btn && !btn.disabled) {
      btn.click();
      return;
    }

    // 제출 버튼을 아직 찾지 못했을 때 1초 뒤 한 번 더 시도
    window.setTimeout(() => {
      const retry = findSubmitButton();
      if (retry && !retry.disabled) retry.click();
    }, 1000);
  }

  function tick() {
    if (!active) return;

    if (!isExamRunning()) {
      stopTimer();
      return;
    }

    const remain = deadline - Date.now();
    updateTimerText(remain);

    if (remain <= 0) {
      stopTimer(false);
      submitByTimeEnd();
    }
  }

  function startTimer() {
    if (active || submitted) return;

    const minutes = getLimitMinutes();
    if (!minutes || minutes <= 0) return;

    active = true;
    deadline = Date.now() + minutes * 60 * 1000;
    updateTimerText(deadline - Date.now());

    timerId = window.setInterval(tick, 500);
  }

  function stopTimer(resetSubmitState = true) {
    active = false;
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
    if (resetSubmitState && !isExamRunning()) {
      submitted = false;
      deadline = 0;
    }
  }

  window.setInterval(() => {
    if (isExamRunning()) {
      startTimer();
    } else {
      stopTimer(true);
    }
  }, 500);
})();