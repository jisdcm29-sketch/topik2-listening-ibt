(function () {
  "use strict";

  const MANIFEST_URL = "./data/exam-manifest.json";
  const BANK_URL = "./data/bank/question-bank.json";

  const $ = (id) => document.getElementById(id);
  const audioController = new window.TopikAudioController();

  const state = {
    manifest: null,
    bank: null,
    isAuthenticated: false,
    examType: "full",
    generationMode: "fixed",
    selectedExamEntry: null,
    roundListExpanded: false,
    currentExam: null,
    screens: [],
    currentScreenIndex: 0,
    answers: {},
    startedAt: null,
    examStartMs: 0,
    screenStartMs: 0,
    totalSeconds: 0,
    remainTimerId: null,
    solveTimerId: null,
    autoAdvanceTimerId: null,
    screenTiming: null,
    flowRunId: 0,
    submitted: false,
    wrongReviewSourceResult: null
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function formatClock(totalSeconds) {
    const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = String(Math.floor(safe / 3600)).padStart(2, "0");
    const m = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
    const s = String(safe % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function formatAudioTime(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(safe / 60);
    const s = String(safe % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(url + " 로드 실패: " + res.status);
    return res.json();
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getUrlParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (error) {
      return null;
    }
  }

  function isWrongReviewRequested() {
    const mode = String(getUrlParam("mode") || getUrlParam("review") || "").toLowerCase();
    return mode === "wrong-review" || mode === "wrong" || mode === "incorrect-review";
  }

  function parseStoredJson(key) {
    try {
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function findWrongReviewSourceResult() {
    const direct = parseStoredJson("topik2_wrong_review_source_result");
    if (direct && Array.isArray(direct.items)) return direct;

    const keys = [
      "topik2_listening_last_result",
      "topik2_listening_result",
      "topik2_listening_last_result_json",
      "topik2_last_result_json",
      "topik2ListeningLastResult",
      "topik2_result",
      "lastResult"
    ];

    for (const key of keys) {
      const result = parseStoredJson(key);
      if (result && Array.isArray(result.items)) return result;
      if (result && result.result && Array.isArray(result.result.items)) return result.result;
      if (result && result.data && Array.isArray(result.data.items)) return result.data;
    }

    return null;
  }

  function itemStorageKey(item) {
    return String(item.id || item.question_number || item.original_question_number || "");
  }

  function originalReviewKey(item) {
    if (item && typeof item.review_source_original_key === "string" && item.review_source_original_key.includes("|")) {
      return item.review_source_original_key;
    }
    const round = String(item?.source_round || item?.review_source_round || item?.generated_exam_round || item?.round || "103");
    const originalNumber = Number(item?.original_question_number || item?.review_source_question_number || item?.question_number || 0);
    return `${round}|${originalNumber}`;
  }

  function sourceResultId(sourceResult) {
    if (!sourceResult) return "";
    const base = [
      sourceResult.submitted_at || "",
      sourceResult.started_at || "",
      sourceResult.test_name || sourceResult.generated_exam_label || "",
      sourceResult.generated_exam_round || sourceResult.source_round || "",
      sourceResult.student_name || "",
      sourceResult.student_phone || "",
      sourceResult.total_questions || "",
      sourceResult.earned_points || "",
      sourceResult.correct_count || ""
    ].join("|");
    return base || "topik2-current-diagnosis";
  }

  function candidateReviewKeys(item) {
    const keys = new Set();
    if (!item) return keys;
    if (item.review_source_original_key) keys.add(String(item.review_source_original_key));
    keys.add(originalReviewKey(item));
    const round = String(item.source_round || item.review_source_round || item.generated_exam_round || item.round || "103");
    const originalNumber = Number(item.original_question_number || item.review_source_question_number || item.question_number || 0);
    if (originalNumber) {
      keys.add(`${round}|${originalNumber}`);
      keys.add(`103|${originalNumber}`);
    }
    return keys;
  }

  function getWrongReviewProgress(sourceResult) {
    try {
      const raw = localStorage.getItem("topik2_wrong_review_progress") || sessionStorage.getItem("topik2_wrong_review_progress");
      const parsed = raw ? JSON.parse(raw) : {};
      const currentSourceId = sourceResultId(sourceResult);

      // 오답풀이 진행률은 원 진단 결과별로만 적용한다.
      // sourceId가 다른 이전 시험의 진행률은 현재 진단에 섞지 않는다.
      if (parsed.sourceId && currentSourceId && parsed.sourceId !== currentSourceId) {
        return { sourceId: currentSourceId, resolvedKeys: [], attempts: [] };
      }

      return {
        sourceId: parsed.sourceId || currentSourceId,
        resolvedKeys: Array.isArray(parsed.resolvedKeys) ? parsed.resolvedKeys.map(String) : [],
        attempts: Array.isArray(parsed.attempts) ? parsed.attempts : []
      };
    } catch (error) {
      return { sourceId: sourceResultId(sourceResult), resolvedKeys: [], attempts: [] };
    }
  }

  function saveWrongReviewProgress(progress, sourceResult) {
    const sourceId = sourceResultId(sourceResult) || progress.sourceId || "";
    const safe = {
      sourceId,
      resolvedKeys: Array.from(new Set((progress.resolvedKeys || []).map(String))),
      attempts: Array.isArray(progress.attempts) ? progress.attempts : [],
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem("topik2_wrong_review_progress", JSON.stringify(safe, null, 2));
    sessionStorage.setItem("topik2_wrong_review_progress", JSON.stringify(safe, null, 2));
    localStorage.setItem("topik2_wrong_review_source_id", sourceId);
    sessionStorage.setItem("topik2_wrong_review_source_id", sourceId);
    return safe;
  }

  function getUnresolvedWrongItems(sourceResult) {
    const progress = getWrongReviewProgress(sourceResult);
    const resolved = new Set(progress.resolvedKeys || []);
    return (Array.isArray(sourceResult?.items) ? sourceResult.items : [])
      .filter((item) => !item.is_correct)
      .filter((item) => {
        for (const key of candidateReviewKeys(item)) {
          if (resolved.has(key)) return false;
        }
        return true;
      });
  }

  function countUnresolvedWrongItems(sourceResult) {
    return getUnresolvedWrongItems(sourceResult).length;
  }

  function updateWrongReviewProgress(sourceResult, reviewResult) {
    const progress = getWrongReviewProgress(sourceResult);
    const resolved = new Set(progress.resolvedKeys || []);
    const originalWrongKeys = new Set();
    getUnresolvedWrongItems(sourceResult).forEach((item) => {
      candidateReviewKeys(item).forEach((key) => originalWrongKeys.add(key));
    });

    const correctedNow = [];
    (Array.isArray(reviewResult?.items) ? reviewResult.items : []).forEach((item) => {
      if (!item.is_correct) return;
      const keys = Array.from(candidateReviewKeys(item));
      const matchedKey = keys.find((key) => originalWrongKeys.has(key));
      if (matchedKey) {
        keys.forEach((key) => resolved.add(key));
        correctedNow.push(matchedKey);
      }
    });

    progress.resolvedKeys = Array.from(resolved);
    progress.attempts = [
      ...(progress.attempts || []),
      {
        submittedAt: new Date().toISOString(),
        sourceId: sourceResultId(sourceResult),
        sourceTestName: sourceResult?.test_name || sourceResult?.generated_exam_label || "",
        reviewTestName: reviewResult?.test_name || "TOPIK II 듣기 오답 다시 풀기",
        reviewedCount: Array.isArray(reviewResult?.items) ? reviewResult.items.length : 0,
        correctedCount: correctedNow.length,
        correctedKeys: correctedNow
      }
    ];

    return {
      progress: saveWrongReviewProgress(progress, sourceResult),
      correctedNow,
      remainingCount: countUnresolvedWrongItems(sourceResult)
    };
  }

  function normalizeResultItemForExam(item, displayNumber) {
    const originalNumber = item.original_question_number || item.question_number || displayNumber;
    return {
      ...cloneJson(item),
      id: `WRONG_REVIEW_L${String(displayNumber).padStart(3, "0")}_SRC_${String(originalNumber).padStart(3, "0")}`,
      question_number: displayNumber,
      original_question_number: originalNumber,
      student_answer: "",
      earned_points: 0,
      is_correct: false,
      review_source_student_answer: item.student_answer || "",
      review_source_is_correct: Boolean(item.is_correct),
      review_source_question_number: item.question_number,
      review_source_original_key: originalReviewKey(item)
    };
  }

  function buildWrongReviewExamFromResult(result) {
    const allItems = (Array.isArray(result.items) ? result.items : [])
      .map((item) => cloneJson(item))
      .sort((a, b) => Number(a.question_number || a.original_question_number || 0) - Number(b.question_number || b.original_question_number || 0));

    const progress = getWrongReviewProgress(result);
    const resolvedKeys = new Set(progress.resolvedKeys || []);

    // STEP12: 오답 다시 풀기 총 문항 수는 현재 남은 실제 오답·미응답 문항 수와 일치시킨다.
    // 이전 로직은 후반부 세트에서 한 문항만 틀려도 정답 처리된 짝 문항까지 포함했기 때문에
    // 진단 보고서 버튼 수와 실제 풀이 화면 총 문항 수가 서로 달라질 수 있었다.
    const wrongItems = allItems
      .filter((item) => !item.is_correct)
      .filter((item) => {
        for (const key of candidateReviewKeys(item)) {
          if (resolvedKeys.has(key)) return false;
        }
        return true;
      });

    if (!wrongItems.length) return null;

    const entries = [];
    let display = 1;
    const consumed = new Set();

    wrongItems.forEach((item) => {
      const key = itemStorageKey(item);
      if (consumed.has(key)) return;

      const originalNumber = Number(item.original_question_number || item.question_number || 0);
      const setId = item.set_id || "";

      if (setId && originalNumber >= 21) {
        const members = wrongItems
          .filter((candidate) => candidate.set_id === setId)
          .sort((a, b) => Number(a.question_number || a.original_question_number || 0) - Number(b.question_number || b.original_question_number || 0));

        const start = display;
        const normalizedMembers = members.map((member) => {
          consumed.add(itemStorageKey(member));
          const normalized = normalizeResultItemForExam(member, display);
          normalized.set_id = `WRONG_REVIEW_SET_${String(start).padStart(3, "0")}`;
          normalized.audio_url = normalized.audio_url || item.audio_url || "";
          display += 1;
          return normalized;
        });

        const end = display - 1;
        entries.push({
          set_id: `WRONG_REVIEW_SET_${String(start).padStart(3, "0")}_${String(end).padStart(3, "0")}`,
          source_round: item.source_round || result.generated_exam_round || "103",
          set_type: "wrong_review_set",
          target_slots: [start, end],
          audio_url: item.audio_url || normalizedMembers[0]?.audio_url || "",
          source_audio_file: item.source_audio_file || "",
          audio_group_id: `WRONG_REVIEW_AUDIO_${String(start).padStart(3, "0")}`,
          audio_group_numbers: [start, end],
          instruction: members.length > 1
            ? `[오답 세트 ${start}~${end}] 다음을 듣고 물음에 답하십시오.`
            : `[오답 ${start}] 다음을 듣고 물음에 답하십시오.`,
          items: normalizedMembers
        });
      } else {
        consumed.add(key);
        entries.push(normalizeResultItemForExam(item, display));
        display += 1;
      }
    });

    const totalQuestions = display - 1;
    const totalPossiblePoints = entries.reduce((sum, entry) => {
      if (Array.isArray(entry.items)) {
        return sum + entry.items.reduce((s, item) => s + Number(item.points || 0), 0);
      }
      return sum + Number(entry.points || 0);
    }, 0);

    return {
      exam_id: "wrong-review",
      source_round: result.generated_exam_round || result.source_round || "103",
      title: "TOPIK II 듣기 오답 다시 풀기",
      level: "TOPIK II",
      section: "listening",
      exam_type: "wrong-review",
      generated_exam_mode: "wrong-review",
      test_scope: `${result.test_name || "TOPIK II 듣기"} 오답·미응답 ${totalQuestions}문항`,
      total_questions: totalQuestions,
      total_possible_points: totalPossiblePoints,
      time_limit_minutes: Math.max(15, Math.ceil(totalQuestions * 1.5)),
      audio_mode: "wrong-review",
      guide_audio: "",
      items: entries
    };
  }

  function startWrongReviewMode() {
    const sourceResult = findWrongReviewSourceResult();
    if (!sourceResult) {
      alert("오답 다시 풀기용 결과를 찾지 못했습니다. 먼저 진단 보고서에서 오답 다시 풀기를 눌러 주세요.");
      return false;
    }

    const reviewExam = buildWrongReviewExamFromResult(sourceResult);
    if (!reviewExam) {
      alert("남은 오답 또는 미응답 문항이 없습니다.");
      return false;
    }

    state.wrongReviewSourceResult = sourceResult;
    localStorage.setItem("topik2_wrong_review_source_id", sourceResultId(sourceResult));
    sessionStorage.setItem("topik2_wrong_review_source_id", sourceResultId(sourceResult));
    state.startedAt = new Date().toISOString();
    state.answers = {};
    state.currentScreenIndex = 0;
    state.submitted = false;
    state.currentExam = reviewExam;
    state.screens = makeScreens(reviewExam);
    state.totalSeconds = getDefaultTimeLimitMinutes(reviewExam) * 60;
    state.examStartMs = Date.now();

    $("studentName").value = sourceResult.student_name || "응시자";
    $("studentPhone").value = sourceResult.student_phone || "";

    $("loginTopBar").style.display = "none";
    $("loginScreen").style.display = "none";
    $("examScreen").style.display = "block";
    $("resultArea").innerHTML = "";

    startRemainTimer();
    renderCurrentScreen();
    window.scrollTo({ top: 0, behavior: "auto" });
    return true;
  }

  function flattenItems(exam) {
    return window.TopikResultBuilder.normalizeQuestionItems((exam && exam.items) || []);
  }

  function getTotalQuestions(exam) {
    const flat = flattenItems(exam);
    return flat.length || exam?.total_questions || 0;
  }

  function getDefaultTimeLimitMinutes(exam) {
    if (Number(exam?.time_limit_minutes)) return Number(exam.time_limit_minutes);
    if (exam?.exam_type === "level-test") return 30;
    return 60;
  }


  function splitRoundTokens(value) {
    if (Array.isArray(value)) {
      return value.flatMap((entry) => splitRoundTokens(entry));
    }
    return String(value || "")
      .split(/[,\s·]+/g)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function sortRoundTokens(rounds) {
    return Array.from(new Set((rounds || []).map((round) => String(round).trim()).filter(Boolean)))
      .sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b, "ko");
      });
  }

  function getBankRoundList(bank) {
    const source = bank || state.bank || {};
    const rounds = [];

    splitRoundTokens(source.bank_rounds || source.source_rounds || source.rounds).forEach((round) => rounds.push(round));

    (source.single_items || []).forEach((item) => {
      splitRoundTokens(item?.source_round || item?.source_rounds || item?.round).forEach((round) => rounds.push(round));
    });

    (source.set_items || []).forEach((entry) => {
      splitRoundTokens(entry?.source_round || entry?.source_rounds || entry?.round).forEach((round) => rounds.push(round));
      (entry?.items || []).forEach((item) => {
        splitRoundTokens(item?.source_round || item?.source_rounds || item?.round).forEach((round) => rounds.push(round));
      });
    });

    return sortRoundTokens(rounds);
  }

  function getBankSourceLabel(bank) {
    const rounds = getBankRoundList(bank);
    return rounds.length ? `${rounds.join("·")}회 문제은행` : "문제은행";
  }

  function getBankSourceRoundCsv(bank) {
    return getBankRoundList(bank).join(",");
  }

  function getBankGuideAudio(bank) {
    const rounds = getBankRoundList(bank);
    if (rounds.length) {
      return `./audio/${rounds[0]}/${rounds[0]}_GUIDE.mp3`;
    }
    return "./audio/103/103_GUIDE.mp3";
  }


  function getVisibleExams() {
    if (!state.manifest || !Array.isArray(state.manifest.exams)) return [];
    return state.manifest.exams.filter((entry) =>
      entry.enabled !== false &&
      entry.student_visible !== false &&
      entry.exam_type === state.examType
    );
  }

  function setActiveButtons(selector, attrName, value) {
    document.querySelectorAll(selector).forEach((button) => {
      button.classList.toggle("active", button.dataset[attrName] === value);
    });
  }

  function updateStartButton() {
    const hasExam = state.generationMode === "random"
      ? Boolean(state.bank)
      : Boolean(state.selectedExamEntry);
    $("startBtn").disabled = !hasExam;
  }

  function renderRoundList() {
    const list = $("roundList");
    list.innerHTML = "";

    const exams = getVisibleExams();
    const getLabel = (entry) => entry?.short_label || entry?.label || entry?.source_round || entry?.exam_id || "";

    if (state.generationMode === "random") {
      state.roundListExpanded = false;
      if (!state.bank) {
        list.innerHTML = "<div class='note-box'>문제은행을 불러오지 못했습니다.</div>";
        $("selectedExamText").textContent = "";
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "round-btn active";
        const bankSourceLabel = getBankSourceLabel();
        btn.textContent = state.examType === "level-test"
          ? `${bankSourceLabel} 기반 랜덤 레벨테스트`
          : `${bankSourceLabel} 기반 랜덤 50문항`;
        btn.addEventListener("click", () => {
          $("selectedExamText").textContent = `${bankSourceLabel} 선택됨`;
        });
        list.appendChild(btn);
        $("selectedExamText").textContent = `${bankSourceLabel} 선택됨`;
      }
      updateStartButton();
      return;
    }

    if (exams.length === 0) {
      list.innerHTML = "<div class='note-box'>등록된 회차가 없습니다.</div>";
      state.selectedExamEntry = null;
      state.roundListExpanded = false;
      $("selectedExamText").textContent = "";
      updateStartButton();
      return;
    }

    if (
      !state.selectedExamEntry ||
      state.selectedExamEntry.exam_type !== state.examType ||
      !exams.some((entry) => entry.exam_id === state.selectedExamEntry.exam_id)
    ) {
      state.selectedExamEntry = exams[0];
    }

    const wrap = document.createElement("div");
    wrap.className = "round-dropdown-wrap";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "10px";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "round-btn active";
    toggleBtn.style.display = "flex";
    toggleBtn.style.alignItems = "center";
    toggleBtn.style.justifyContent = "space-between";
    toggleBtn.style.gap = "12px";
    toggleBtn.setAttribute("aria-expanded", state.roundListExpanded ? "true" : "false");

    const selectedText = document.createElement("span");
    selectedText.textContent = getLabel(state.selectedExamEntry);

    const arrowText = document.createElement("span");
    arrowText.textContent = state.roundListExpanded ? "▲" : "▼";
    arrowText.style.fontSize = "14px";
    arrowText.style.flex = "0 0 auto";

    toggleBtn.appendChild(selectedText);
    toggleBtn.appendChild(arrowText);
    toggleBtn.addEventListener("click", () => {
      state.roundListExpanded = !state.roundListExpanded;
      renderRoundList();
    });
    wrap.appendChild(toggleBtn);

    const panel = document.createElement("div");
    panel.className = "round-dropdown-panel";
    panel.style.display = state.roundListExpanded ? "flex" : "none";
    panel.style.flexDirection = "column";
    panel.style.gap = "10px";
    panel.style.paddingTop = "2px";

    exams.forEach((entry) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "round-btn";
      btn.textContent = getLabel(entry);
      btn.classList.toggle("active", state.selectedExamEntry && state.selectedExamEntry.exam_id === entry.exam_id);
      btn.addEventListener("click", () => {
        state.selectedExamEntry = entry;
        state.roundListExpanded = false;
        renderRoundList();
      });
      panel.appendChild(btn);
    });

    wrap.appendChild(panel);
    list.appendChild(wrap);

    $("selectedExamText").textContent =
      state.selectedExamEntry ? `${getLabel(state.selectedExamEntry)} 선택됨` : "";
    updateStartButton();
  }

  async function loadInitialData() {
    try {
      state.manifest = await fetchJson(MANIFEST_URL);
    } catch (error) {
      $("roundList").innerHTML = `<div class="note-box">manifest 오류: ${escapeHtml(error.message)}</div>`;
    }

    try {
      state.bank = await fetchJson(BANK_URL);
    } catch (error) {
      state.bank = null;
    }

    renderRoundList();
  }

  function handleAuth() {
    const pass = $("authPassword").value.trim();
    if (!pass) {
      $("authStatus").textContent = "인증 비밀번호를 입력하세요.";
      state.isAuthenticated = false;
      return;
    }
    state.isAuthenticated = true;
    $("authStatus").textContent = "인증되었습니다.";
  }

  function makeScreens(exam) {
    return (exam.items || []).map((entry) => {
      if (entry && entry.items && Array.isArray(entry.items)) {
        return { type: "set", entry, questions: entry.items };
      }
      return { type: "single", entry, questions: [entry] };
    });
  }

  function getEntryAudioUrl(screen) {
    if (!screen) return "";
    if (screen.type === "set") return screen.entry.audio_url || "";
    return screen.entry.audio_url || "";
  }

  function getScreenQuestionRange(screen) {
    const nums = (screen?.questions || []).map((q) => Number(q.question_number)).filter(Boolean);
    if (nums.length === 0) return "";
    if (nums.length === 1) return String(nums[0]);
    return `${Math.min(...nums)}-${Math.max(...nums)}`;
  }

  function clampSeconds(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function screenHasVisualQuestion(screen) {
    return (screen?.questions || []).some((q) =>
      Array.isArray(q.image_options) && q.image_options.length > 0
    );
  }

  function getScreenSolveSeconds(screen) {
    const entry = screen?.entry || {};
    const candidates = [
      entry.solve_seconds,
      entry.post_listen_seconds,
      entry.after_audio_seconds,
      ...((screen?.questions || []).flatMap((q) => [
        q.solve_seconds,
        q.post_listen_seconds,
        q.after_audio_seconds
      ]))
    ];

    for (const value of candidates) {
      if (Number.isFinite(Number(value))) return clampSeconds(value, 5, 15);
    }

    if (screen?.type === "set") return 15;
    if (screenHasVisualQuestion(screen)) return 8;

    const qn = Number((screen?.questions || [])[0]?.question_number || 0);
    if (qn >= 4 && qn <= 8) return 5;
    if (qn >= 9 && qn <= 12) return 8;
    if (qn >= 13 && qn <= 20) return 10;
    return 7;
  }

  function setPhaseActive(phase) {
    $("waitBox").classList.toggle("active", phase === "wait");
    $("listenBox").classList.toggle("active", phase === "listen");
    $("solveBox").classList.toggle("active", phase === "solve");
  }

  function clearFlowTimers() {
    window.clearInterval(state.solveTimerId);
    state.solveTimerId = null;
    clearAutoAdvanceTimer();
  }

  function runCountdown(phase, seconds, onDone) {
    clearFlowTimers();

    const runId = state.flowRunId;
    const duration = Math.max(0, Number(seconds) || 0);
    const endAt = Date.now() + duration * 1000;

    setPhaseActive(phase);

    const update = () => {
      if (runId !== state.flowRunId || state.submitted) {
        clearFlowTimers();
        return;
      }

      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));

      if (phase === "wait") $("waitTime").textContent = formatClock(remaining);
      if (phase === "solve") $("solveTime").textContent = formatClock(remaining);

      if (remaining <= 0) {
        clearFlowTimers();
        onDone();
      }
    };

    update();
    state.solveTimerId = window.setInterval(update, 250);
  }

  function startSolvePhaseAfterAudio() {
    if (state.submitted || !state.screenTiming) return;
    const runId = state.flowRunId;
    const solveSeconds = clampSeconds(state.screenTiming.solveSeconds, 5, 15);

    $("waitTime").textContent = "00:00:00";
    $("listenTime").textContent = "00:00:00";
    $("solveTime").textContent = formatClock(solveSeconds);

    const status = $("audioStatusLabel");
    if (status) {
      status.textContent = "풀이 중";
      status.classList.remove("playing");
    }

    runCountdown("solve", solveSeconds, () => {
      if (runId !== state.flowRunId || state.submitted) return;
      goToNextScreen(true);
    });
  }

  function startWaitThenAudio(currentAudio) {
    state.flowRunId += 1;
    const runId = state.flowRunId;
    const waitSeconds = 2;
    const solveSeconds = getScreenSolveSeconds(state.screens[state.currentScreenIndex]);

    state.screenTiming = {
      waitSeconds,
      solveSeconds,
      phase: "wait"
    };

    $("waitTime").textContent = formatClock(waitSeconds);
    $("listenTime").textContent = "00:00:00";
    $("solveTime").textContent = formatClock(solveSeconds);
    setPhaseActive("wait");

    const status = $("audioStatusLabel");
    if (status) {
      status.textContent = "대기";
      status.classList.remove("playing");
    }

    runCountdown("wait", waitSeconds, () => {
      if (runId !== state.flowRunId || state.submitted) return;

      $("waitTime").textContent = "00:00:00";
      setPhaseActive("listen");

      if (!currentAudio) {
        startSolvePhaseAfterAudio();
        return;
      }

      const audio = audioController.getAudio();
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      $("listenTime").textContent = formatClock(duration);

      audioController.play(currentAudio).catch((error) => {
        const waitingStatus = $("audioStatusLabel");
        if (waitingStatus) waitingStatus.textContent = "자동 재생 대기";
        console.warn("오디오 자동 재생 대기:", error);
      });
    });
  }

  function isCurrentQuestionNumber(qn) {
    const screen = state.screens[state.currentScreenIndex];
    return (screen?.questions || []).some((q) => String(q.question_number) === String(qn));
  }

  function shouldUseTwoColumnOptions(question) {
    const qn = Number(question.question_number);
    return qn >= 9 && qn <= 12;
  }

  function renderTextOption(question, option) {
    const qn = String(question.question_number);
    const selected = String(state.answers[qn] || "") === String(option.number);
    return `
      <label class="answer-option ${selected ? "selected" : ""}">
        <input type="radio" name="q_${escapeHtml(qn)}" value="${escapeHtml(option.number)}" ${selected ? "checked" : ""}>
        <span class="option-circle">${escapeHtml(option.number)}</span>
        <span>${escapeHtml(option.text || "")}</span>
      </label>
    `;
  }

  function renderImageOption(question, imageOption) {
    const qn = String(question.question_number);
    const selected = String(state.answers[qn] || "") === String(imageOption.number);
    return `
      <label class="image-option ${selected ? "selected" : ""}">
        <input type="radio" name="q_${escapeHtml(qn)}" value="${escapeHtml(imageOption.number)}" ${selected ? "checked" : ""}>
        <span class="option-circle">${escapeHtml(imageOption.number)}</span>
        <img src="${escapeHtml(imageOption.image_url)}" alt="${escapeHtml(qn)}번 선택지 ${escapeHtml(imageOption.number)}">
      </label>
    `;
  }

  function renderQuestionPaper(question) {
    const qn = Number(question.question_number);
    const original = question.original_question_number && Number(question.original_question_number) !== qn
      ? `<span class="source-q">원문항 ${escapeHtml(question.original_question_number)}번</span>`
      : "";

    const hasImages = Array.isArray(question.image_options) && question.image_options.length > 0;
    const optionsHtml = hasImages
      ? `<div class="image-grid">${question.image_options.map((opt) => renderImageOption(question, opt)).join("")}</div>`
      : `<div class="answer-list ${shouldUseTwoColumnOptions(question) ? "two-column" : ""}">
          ${(question.options || []).map((opt) => renderTextOption(question, opt)).join("")}
        </div>`;

    const paperClass = hasImages ? "single-paper visual-paper" : "single-paper";

    return `
      <div class="${paperClass}" data-question-number="${escapeHtml(qn)}">
        <h2 class="question-title">${escapeHtml(qn)}. ${escapeHtml(question.question || "")}${original}</h2>
        ${optionsHtml}
      </div>
    `;
  }

  function bindAnswerEvents() {
    document.querySelectorAll("#questionArea input[type='radio']").forEach((input) => {
      input.addEventListener("change", (event) => {
        const name = event.target.name || "";
        const qn = name.replace("q_", "");
        state.answers[qn] = event.target.value;

        document.querySelectorAll("#questionArea input[type='radio']").forEach((radio) => {
          if (radio.name !== name) return;
          const label = radio.closest("label");
          if (label) label.classList.toggle("selected", radio.checked);
        });

        renderProgress();
      });
    });
  }


  function updateSubmitVisibility() {
    const button = $("submitBtnBottom");
    if (!button) return;

    if (state.currentExam && state.currentExam.exam_type === "wrong-review") {
      button.classList.add("visible");
      button.disabled = false;
      button.textContent = "오답 풀이 제출";
      return;
    }

    button.textContent = "제출";
    const screen = state.screens[state.currentScreenIndex];
    const total = getTotalQuestions(state.currentExam || {});
    const maxQn = Math.max(
      0,
      ...((screen && screen.questions) || []).map((q) => Number(q.question_number) || 0)
    );

    // 50문항 실전시험에서는 50번이 포함된 마지막 화면에서만 제출 버튼을 보여 준다.
    // 레벨테스트처럼 총 문항 수가 다른 경우에는 해당 시험의 마지막 화면에서만 보여 준다.
    const isFinalScreen = total === 50 ? maxQn >= 50 : maxQn >= total;

    button.classList.toggle("visible", isFinalScreen);
    button.disabled = !isFinalScreen;
  }

  function renderCurrentScreen() {
    const screen = state.screens[state.currentScreenIndex];
    if (!screen) return;

    clearAutoAdvanceTimer();
    audioController.stop();

    const exam = state.currentExam;
    const totalQuestions = getTotalQuestions(exam);
    const range = getScreenQuestionRange(screen);
    const currentAudio = getEntryAudioUrl(screen);
    const hasVisualQuestion = screenHasVisualQuestion(screen);

    $("studentTopName").textContent = $("studentName").value.trim() || "응시자";
    $("testTopTitle").textContent = exam.title || "TOPIK II 듣기 PBT형 IBT";
    $("groupInstruction").textContent = screen.entry.instruction || "";
    $("questionCounter").textContent = `${range} / ${totalQuestions}`;
    $("questionArea").classList.toggle("visual-area", hasVisualQuestion);

    if (currentAudio) {
      audioController.load(currentAudio);
    }

    const setHtml = screen.type === "set"
      ? `<div class="set-paper">${screen.questions.map(renderQuestionPaper).join("")}</div>`
      : renderQuestionPaper(screen.questions[0]);

    $("questionArea").innerHTML = setHtml;

    $("prevBtn").disabled = state.currentScreenIndex === 0;
    $("nextBtn").disabled = state.currentScreenIndex >= state.screens.length - 1;
    updateSubmitVisibility();

    state.screenStartMs = Date.now();
    state.screenTiming = null;

    updateAudioUi();
    bindAnswerEvents();
    renderProgress();
    startWaitThenAudio(currentAudio);
  }

  function renderProgress() {
    // 화면 하단 번호 이동 버튼은 TOPIK I 화면 기준에 맞춰 표시하지 않는다.
    // 답안 저장은 state.answers에서 계속 관리한다.
  }

  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function generateRandomExamFromBank() {
    const bank = state.bank;
    if (!bank) throw new Error("문제은행을 불러오지 못했습니다.");

    const singles = bank.single_items || [];
    const sets = bank.set_items || [];

    const singleSlots = [
      { range: [1, 3], type: "visual_graph_choice" },
      { range: [4, 8], type: "following_response" },
      { range: [9, 12], type: "next_action" },
      { range: [13, 16], type: "same_content_single" },
      { range: [17, 20], type: "main_thought_single" }
    ];

    const selectedSingles = [];

    singleSlots.forEach((slot) => {
      const needed = slot.range[1] - slot.range[0] + 1;
      const candidates = shuffle(singles.filter((item) => item.type === slot.type));
      if (candidates.length < needed) {
        throw new Error(`${slot.type} 후보가 부족합니다.`);
      }
      candidates.slice(0, needed).forEach((item) => selectedSingles.push(cloneJson(item)));
    });

    const setNeeded = state.examType === "level-test" ? 5 : 15;
    const selectedSets = shuffle(sets).slice(0, setNeeded).map((entry) => cloneJson(entry));
    if (selectedSets.length < setNeeded) {
      throw new Error("세트 문항 후보가 부족합니다.");
    }

    const randomItems = [];
    let display = 1;
    const singleLimit = state.examType === "level-test" ? 20 : 20;

    selectedSingles.slice(0, singleLimit).forEach((item) => {
      item.original_question_number = item.original_question_number || item.question_number;
      item.question_number = display;
      item.id = `RANDOM_BANK_L${String(display).padStart(3, "0")}_SRC_${String(item.original_question_number).padStart(3, "0")}`;
      randomItems.push(item);
      display += 1;
    });

    selectedSets.forEach((entry) => {
      const originalNumbers = (entry.audio_group_numbers || entry.target_slots || []).slice();
      const setStart = display;
      const setEnd = display + 1;
      entry.set_id = `RANDOM_BANK_SET_${String(setStart).padStart(3, "0")}_${String(setEnd).padStart(3, "0")}_SRC_${originalNumbers.join("_")}`;
      entry.target_slots = [setStart, setEnd];
      entry.original_target_slots = originalNumbers;
      entry.audio_group_numbers = [setStart, setEnd];
      entry.instruction = `[${setStart}~${setEnd}] 다음을 듣고 물음에 답하십시오. (각 2점)`;
      entry.items = (entry.items || []).map((item, idx) => {
        item.original_question_number = item.original_question_number || item.question_number;
        item.question_number = display + idx;
        item.id = `RANDOM_BANK_L${String(display + idx).padStart(3, "0")}_SRC_${String(item.original_question_number).padStart(3, "0")}`;
        item.set_id = entry.set_id;
        item.audio_url = item.audio_url || entry.audio_url;
        return item;
      });
      randomItems.push(entry);
      display += 2;
    });

    const totalQuestions = display - 1;
    return {
      exam_id: state.examType === "level-test" ? "random-bank-level-test" : "random-bank",
      source_round: getBankSourceRoundCsv(bank),
      bank_rounds: getBankRoundList(bank),
      title: state.examType === "level-test" ? "TOPIK II 듣기 문제은행 랜덤 레벨테스트" : "TOPIK II 듣기 문제은행 랜덤 50문항",
      level: "TOPIK II",
      section: "listening",
      exam_type: state.examType === "level-test" ? "level-test" : "random",
      generated_exam_mode: "random",
      test_scope: `${getBankSourceLabel(bank)} 기반 랜덤 ${totalQuestions}문항`,
      total_questions: totalQuestions,
      total_possible_points: totalQuestions * 2,
      time_limit_minutes: state.examType === "level-test" ? 30 : 60,
      audio_mode: "manual",
      guide_audio: getBankGuideAudio(bank),
      items: randomItems
    };
  }

  async function startExam() {
    try {
      state.startedAt = new Date().toISOString();
      state.answers = {};
      state.currentScreenIndex = 0;
      state.submitted = false;
      $("resultArea").innerHTML = "";

      let exam;
      if (state.generationMode === "random") {
        exam = generateRandomExamFromBank();
      } else {
        if (!state.selectedExamEntry) throw new Error("시험지를 선택하세요.");
        exam = await fetchJson(state.selectedExamEntry.test_file);
        exam.generated_exam_mode = "fixed";
      }

      state.currentExam = exam;
      state.screens = makeScreens(exam);
      state.totalSeconds = getDefaultTimeLimitMinutes(exam) * 60;
      state.examStartMs = Date.now();

      $("loginTopBar").style.display = "none";
      $("loginScreen").style.display = "none";
      $("examScreen").style.display = "block";

      startRemainTimer();
      renderCurrentScreen();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      alert(error.message);
    }
  }


  function getScoreBand(score) {
    const value = Number(score || 0);
    if (value >= 85) {
      return {
        title: "TOPIK II 듣기 고급 안정권",
        range: "85~100점",
        level: "고급 담화 이해 안정 단계",
        stable: "TOPIK II 듣기 고득점권 유지 단계",
        next: "전문 담화의 세부 논리와 말하는 방식 정교화",
        advice: "긴 담화의 구조, 화자의 태도, 말하는 방식을 근거와 함께 설명하는 연습을 유지하세요."
      };
    }
    if (value >= 70) {
      return {
        title: "TOPIK II 듣기 고급 진입 가능",
        range: "70~84점",
        level: "고급 담화 이해 진입 단계",
        stable: "후반부 세트 문항 안정화 필요",
        next: "85점 이상, 전문 담화 세부 추론 강화",
        advice: "21~50번 세트 문항에서 중심 생각과 내용 일치 근거를 동시에 잡는 연습이 필요합니다."
      };
    }
    if (value >= 50) {
      return {
        title: "TOPIK II 듣기 중급 안정화 필요",
        range: "50~69점",
        level: "중급 담화 이해 보완 단계",
        stable: "전반부는 가능하나 후반부 긴 담화 보완 필요",
        next: "70점 이상, 후반부 세트 문항 정답률 향상",
        advice: "13~20번 단일 담화와 21~30번 세트 문항을 묶어 다시 듣고 핵심 근거를 표시하세요."
      };
    }
    if (value >= 30) {
      return {
        title: "TOPIK II 듣기 중급 진입 준비",
        range: "30~49점",
        level: "기본 담화 이해는 가능하나 유형별 보완 필요",
        stable: "TOPIK II 안정권 진입 전 준비 단계",
        next: "50점 이상, 전반부 단일 문항 안정화",
        advice: "4~20번의 짧은 대화, 행동 추론, 내용 일치 문항부터 다시 안정화해야 합니다."
      };
    }
    return {
      title: "TOPIK II 듣기 기초 보완 필요",
      range: "0~29점",
      level: "기초 듣기 표현과 핵심 단서 보완 단계",
      stable: "TOPIK II 안정권 진입 전 기초 단계",
      next: "30점 이상, 짧은 대화와 기본 정보 파악 안정화",
      advice: "짧은 질문과 응답, 인물의 행동, 장소·상황 단서를 먼저 잡는 연습이 필요합니다."
    };
  }

  function getDiagnosticLabel(key, fallback) {
    const labels = {
      visual_graph_choice: "알맞은 그림/그래프 고르기",
      following_response: "이어질 수 있는 말 고르기",
      next_action: "여자가 이어서 할 행동 고르기",
      same_content_single: "들은 내용과 같은 것 고르기",
      main_thought_single: "남자의 중심 생각 고르기",
      main_thought_set: "세트 중심 생각 파악",
      speaker_action_intention: "행동·의도 파악하기",
      speaker_identity: "인물 신분·역할 파악하기",
      topic_content: "주제·내용 파악하기",
      attitude_method: "태도·말하는 방식 파악하기",
      same_content_set: "세트 내용 일치 고르기"
    };
    return labels[key] || fallback || key || "기타";
  }

  function countByDiagnosticArea(result) {
    const map = new Map();
    (result.items || []).forEach((item) => {
      const key = item.diagnostic_area || item.category || "기타";
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: getDiagnosticLabel(key, item.category),
          total: 0,
          correct: 0,
          points: 0,
          earned: 0,
          wrongNumbers: []
        });
      }
      const row = map.get(key);
      row.total += 1;
      row.points += Number(item.points || 0);
      row.earned += Number(item.earned_points || 0);
      if (item.is_correct) {
        row.correct += 1;
      } else {
        row.wrongNumbers.push(item.question_number);
      }
    });
    return Array.from(map.values()).map((row) => ({
      ...row,
      rate: row.points > 0 ? Math.round((row.earned / row.points) * 100) : 0
    })).sort((a, b) => a.rate - b.rate || b.total - a.total);
  }

  function buildResultSummaryHtml(result) {
    const score = Number(result.section_score_100 ?? result.earned_points ?? 0);
    const band = getScoreBand(score);
    const unanswered = Number(result.unanswered_count || 0);
    const modeLabel = result.generated_exam_mode === "random" ? "랜덤 시험지" : (result.generated_exam_label || result.test_name || "회차별 시험지");
    const topWeak = countByDiagnosticArea(result).slice(0, 3);
    const weakText = topWeak.length
      ? topWeak.map((row) => `${escapeHtml(row.label)} ${escapeHtml(row.rate)}%`).join(", ")
      : "아직 분석할 유형 정보가 없습니다.";

    return `
      <style>
        body { background:#f3f6fb; }
        .result-summary-page {
          max-width: 1060px;
          margin: 52px auto;
          padding: 0 20px;
          color: #073763;
          font-family: "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif;
        }
        .result-card {
          background:#fff;
          border-radius:16px;
          box-shadow:0 18px 42px rgba(15,23,42,.12);
          padding:34px 34px 36px;
        }
        .result-card h1 {
          margin:0 0 18px;
          font-size:34px;
          letter-spacing:-1px;
          color:#073763;
        }
        .result-lead {
          color:#0f2742;
          font-size:16px;
          line-height:1.65;
          margin:0 0 24px;
        }
        .summary-grid {
          display:grid;
          grid-template-columns: repeat(4, 1fr);
          gap:12px;
          margin-bottom:22px;
        }
        .summary-tile {
          border:1px solid #d8e4f4;
          background:#fbfdff;
          border-radius:11px;
          padding:16px 18px;
          min-height:92px;
        }
        .summary-tile span {
          display:block;
          color:#64748b;
          font-size:14px;
          font-weight:800;
          margin-bottom:8px;
        }
        .summary-tile strong {
          display:block;
          color:#003f82;
          font-size:26px;
          line-height:1.1;
          word-break:break-word;
        }
        .summary-message {
          background:#eaf5ff;
          border:1.5px solid #78b7ff;
          border-radius:12px;
          padding:20px 22px;
          color:#073763;
          line-height:1.75;
          margin-bottom:22px;
        }
        .summary-message h2 {
          margin:0 0 10px;
          font-size:24px;
        }
        .summary-message p { margin:6px 0; }
        .summary-actions {
          display:flex;
          gap:12px;
          flex-wrap:wrap;
          margin-top:10px;
        }
        .summary-actions button {
          border:0;
          border-radius:10px;
          padding:14px 20px;
          font-size:16px;
          font-weight:900;
          cursor:pointer;
        }
        .diagnosis-btn { background:#1a73e8; color:#fff; }
        .back-btn { background:#eff6ff; color:#0b57d0; border:1px solid #b7d5ff !important; }
        @media (max-width: 760px) {
          .summary-grid { grid-template-columns:1fr 1fr; }
          .result-card { padding:24px 18px; }
        }
      </style>
      <div class="result-summary-page">
        <section class="result-card">
          <h1>TOPIK II 듣기 결과 요약</h1>
          <p class="result-lead">
            제출이 완료되었습니다. 이 화면에서는 듣기 점수와 기본 결과를 확인할 수 있습니다.
            자세한 유형별 분석, 약점 진단, 학습 처방은 진단 보고서에서 확인하세요.
          </p>

          <div class="summary-grid">
            <div class="summary-tile"><span>응시자</span><strong>${escapeHtml(result.student_name || "-")}</strong></div>
            <div class="summary-tile"><span>듣기 점수</span><strong>${escapeHtml(result.earned_points)} / ${escapeHtml(result.total_possible_points || 100)}</strong></div>
            <div class="summary-tile"><span>정답 수</span><strong>${escapeHtml(result.correct_count)} / ${escapeHtml(result.total_questions)}</strong></div>
            <div class="summary-tile"><span>미응답</span><strong>${escapeHtml(unanswered)}</strong></div>
          </div>

          <div class="summary-message">
            <h2>${escapeHtml(band.title)}</h2>
            <p>듣기 점수 구간: ${escapeHtml(band.range)}</p>
            <p>예상 수준: ${escapeHtml(band.level)}</p>
            <p>안정권 해석: ${escapeHtml(band.stable)}</p>
            <p>다음 목표: ${escapeHtml(band.next)}</p>
            <p>${escapeHtml(band.advice)}</p>
            <p><strong>출제 방식</strong><br>${escapeHtml(modeLabel)}</p>
            <p><strong>우선 확인 유형</strong><br>${weakText}</p>
            <p><strong>안내</strong><br>이 결과는 TOPIK II 듣기 영역 기준 결과입니다. 공식 TOPIK 급수는 전체 시험 기준에 따라 달라질 수 있습니다.</p>
          </div>

          <div class="summary-actions">
            <button class="diagnosis-btn" type="button" onclick="window.open('../listening-diagnosis/index.html?auto=1&v=103', '_blank')">진단 보고서 보기</button>
            <button class="back-btn" type="button" onclick="location.reload()">처음 화면으로 돌아가기</button>
          </div>
        </section>
      </div>
    `;
  }

  function buildWrongReviewResultSummaryHtml(result, reviewInfo) {
    const correctedCount = reviewInfo?.correctedNow?.length || 0;
    const remainingCount = Number(reviewInfo?.remainingCount || 0);
    const reviewedCount = Number(result.total_questions || 0);
    const correctCount = Number(result.correct_count || 0);

    return `
      <style>
        body { background:#f3f6fb; }
        .result-summary-page {
          max-width: 980px;
          margin: 52px auto;
          padding: 0 20px;
          color: #073763;
          font-family: "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif;
        }
        .result-card {
          background:#fff;
          border-radius:16px;
          box-shadow:0 18px 42px rgba(15,23,42,.12);
          padding:34px 34px 36px;
        }
        .result-card h1 { margin:0 0 18px; font-size:32px; color:#073763; }
        .result-lead { color:#0f2742; font-size:16px; line-height:1.7; margin:0 0 24px; }
        .summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:22px; }
        .summary-tile { border:1px solid #d8e4f4; background:#fbfdff; border-radius:11px; padding:16px 18px; min-height:92px; }
        .summary-tile span { display:block; color:#64748b; font-size:14px; font-weight:800; margin-bottom:8px; }
        .summary-tile strong { display:block; color:#003f82; font-size:26px; line-height:1.1; }
        .summary-message { background:#eaf5ff; border:1.5px solid #78b7ff; border-radius:12px; padding:20px 22px; color:#073763; line-height:1.75; margin-bottom:22px; }
        .summary-actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:10px; }
        .summary-actions button { border:0; border-radius:10px; padding:14px 20px; font-size:16px; font-weight:900; cursor:pointer; }
        .diagnosis-btn { background:#1a73e8; color:#fff; }
        .back-btn { background:#eff6ff; color:#0b57d0; border:1px solid #b7d5ff !important; }
        @media (max-width: 760px) { .summary-grid { grid-template-columns:1fr 1fr; } .result-card { padding:24px 18px; } }
      </style>
      <div class="result-summary-page">
        <section class="result-card">
          <h1>TOPIK II 듣기 오답 풀이 결과</h1>
          <p class="result-lead">
            오답 풀이가 제출되었습니다. 이 결과는 오답 풀이 진행률에만 반영되며,
            처음 50문항 시험의 진단 보고서 점수와 분석 내용은 변경하지 않습니다.
          </p>
          <div class="summary-grid">
            <div class="summary-tile"><span>다시 푼 문항</span><strong>${escapeHtml(reviewedCount)}</strong></div>
            <div class="summary-tile"><span>이번 정답</span><strong>${escapeHtml(correctCount)}</strong></div>
            <div class="summary-tile"><span>이번 차감</span><strong>${escapeHtml(correctedCount)}</strong></div>
            <div class="summary-tile"><span>남은 오답</span><strong>${escapeHtml(remainingCount)}</strong></div>
          </div>
          <div class="summary-message">
            <h2>오답 풀이 전용 결과</h2>
            <p>이번에 맞힌 오답은 다음 오답 다시 풀기 목록에서 제외됩니다.</p>
            <p>원래 50문항 시험의 결과 JSON과 진단 보고서는 그대로 유지됩니다.</p>
            <p>남은 오답이 있으면 진단 보고서에서 다시 오답 풀이를 시작할 수 있습니다.</p>
          </div>
          <div class="summary-actions">
            <button class="diagnosis-btn" type="button" onclick="window.open('../listening-diagnosis/index.html?auto=1&v=step16reviewprogress01', '_blank')">진단 보고서로 돌아가기</button>
            <button class="back-btn" type="button" onclick="location.href='./index.html?v=wrongreviewdone'">처음 화면으로 돌아가기</button>
          </div>
        </section>
      </div>
    `;
  }

  function submitExam() {
    if (!state.currentExam || state.submitted) return;

    const isWrongReview = state.currentExam.exam_type === "wrong-review";
    const originalLastResultRaw = localStorage.getItem("topik2_listening_last_result");
    const originalLastResultSessionRaw = sessionStorage.getItem("topik2_listening_last_result");
    const sourceResult = isWrongReview
      ? (state.wrongReviewSourceResult || findWrongReviewSourceResult())
      : null;

    state.submitted = true;
    clearFlowTimers();
    audioController.stop();
    window.clearInterval(state.remainTimerId);

    const result = window.TopikResultBuilder.buildResult({
      exam: state.currentExam,
      answers: state.answers,
      studentName: $("studentName").value.trim(),
      studentPhone: $("studentPhone").value.trim(),
      startedAt: state.startedAt
    });

    const bottomAudio = document.querySelector(".bottom-audio");
    if (bottomAudio) bottomAudio.style.display = "none";
    const loginTopBar = $("loginTopBar");
    if (loginTopBar) loginTopBar.style.display = "none";

    if (isWrongReview) {
      result.test_name = "TOPIK II 듣기 오답 다시 풀기";
      result.test_scope = state.currentExam.test_scope || "오답 다시 풀기";
      result.generated_exam_mode = "wrong-review";
      result.generated_exam_label = "오답 다시 풀기";
      result.review_only = true;

      let reviewInfo = { correctedNow: [], remainingCount: 0 };
      if (sourceResult && Array.isArray(sourceResult.items)) {
        reviewInfo = updateWrongReviewProgress(sourceResult, result);
        localStorage.setItem("topik2_wrong_review_source_result", JSON.stringify(sourceResult, null, 2));
        sessionStorage.setItem("topik2_wrong_review_source_result", JSON.stringify(sourceResult, null, 2));
      }

      localStorage.setItem("topik2_wrong_review_last_result", JSON.stringify(result, null, 2));
      sessionStorage.setItem("topik2_wrong_review_last_result", JSON.stringify(result, null, 2));

      // 오답 풀이 결과는 원래 50문항 시험 결과를 덮어쓰지 않는다.
      if (originalLastResultRaw) localStorage.setItem("topik2_listening_last_result", originalLastResultRaw);
      else localStorage.removeItem("topik2_listening_last_result");
      if (originalLastResultSessionRaw) sessionStorage.setItem("topik2_listening_last_result", originalLastResultSessionRaw);
      else sessionStorage.removeItem("topik2_listening_last_result");

      // 오답 풀이 제출 후에는 별도 결과 요약 화면을 띄우지 않고
      // 원 진단 보고서 화면으로 바로 돌아간다.
      // 이때 오답 풀이 진행률은 이미 topik2_wrong_review_progress에만 반영되어 있고,
      // 원래 50문항 진단 결과는 topik2_listening_last_result에 복원되어 있다.
      window.location.href = "../listening-diagnosis/index.html?auto=1&v=step18wrongreviewcount01";
      return;
    }

    $("examScreen").className = "";
    $("examScreen").innerHTML = buildResultSummaryHtml(result);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openTeacherPrint() {
    const entry = state.generationMode === "random" ? null : state.selectedExamEntry;
    const file = entry?.test_file || "./data/exams/listening-103.json";

    // teacher-print.html은 여러 번 교체되는 파일이므로,
    // 브라우저가 예전 v=103 캐시 화면을 다시 보여 주지 않도록 매번 새 버전값을 붙인다.
    const cacheBust = Date.now();
    const url = `./teacher-print.html?file=${encodeURIComponent(file)}&v=step27teacherprintreturn01&t=${cacheBust}`;
    window.open(url, "_blank", "noopener");
  }

  function startRemainTimer() {
    window.clearInterval(state.remainTimerId);
    const tick = () => {
      const elapsed = Math.floor((Date.now() - state.examStartMs) / 1000);
      const remain = Math.max(0, state.totalSeconds - elapsed);
      $("remainTime").textContent = formatClock(remain);
      if (remain <= 0 && !state.submitted) {
        submitExam();
      }
    };
    tick();
    state.remainTimerId = window.setInterval(tick, 1000);
  }

  function startSolveTimer() {
    // Step 11부터 대기 2초 → 듣기 음원 길이 → 풀이 5~15초 순서로 관리한다.
    // 기존 함수명은 이전 코드와의 호환을 위해 남긴다.
    clearFlowTimers();
  }

  function clearAutoAdvanceTimer() {
    if (state.autoAdvanceTimerId) {
      window.clearTimeout(state.autoAdvanceTimerId);
      state.autoAdvanceTimerId = null;
    }
  }

  function goToNextScreen(autoMode) {
    if (!state.currentExam || state.submitted) return;
    if (state.currentScreenIndex < state.screens.length - 1) {
      state.currentScreenIndex += 1;
      renderCurrentScreen();
      window.scrollTo({ top: 0, behavior: autoMode ? "auto" : "smooth" });
      return;
    }

    // 마지막 문항에서는 자동 제출하지 않고 학생이 제출 버튼을 누르게 둔다.
    const status = $("audioStatusLabel");
    if (status) status.textContent = "마지막 문항";
  }

  function scheduleAutoAdvanceAfterAudioEnd() {
    clearAutoAdvanceTimer();
    state.autoAdvanceTimerId = window.setTimeout(() => {
      startSolvePhaseAfterAudio();
    }, 250);
  }

  function updateAudioUi() {
    const audio = audioController.getAudio();
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const remaining = duration > 0 ? Math.max(0, duration - current) : 0;

    // 대기/풀이 시간은 별도 카운트다운이 관리하고, 듣기 시간은 음원 남은 시간으로 표시한다.
    if (!state.screenTiming || $("listenBox").classList.contains("active")) {
      $("listenTime").textContent = formatClock(remaining);
    }

    $("audioTime").textContent = `${formatAudioTime(remaining)} / ${formatAudioTime(duration)}`;

    const ratio = duration > 0 ? current / duration : 0;
    $("audioProgress").value = String(Math.round(ratio * 1000));

    const playing = !audio.paused && !audio.ended;
    const status = $("audioStatusLabel");
    if (status) {
      if (playing) {
        status.textContent = "재생 중";
        status.classList.add("playing");
      } else if (audio.ended) {
        status.textContent = "듣기 완료";
        status.classList.remove("playing");
      } else if (state.screenTiming && $("waitBox").classList.contains("active")) {
        status.textContent = "대기";
        status.classList.remove("playing");
      } else {
        status.textContent = "자동 재생";
        status.classList.remove("playing");
      }
    }

    if (playing) setPhaseActive("listen");
  }

  function bindAudioEvents() {
    const audio = audioController.getAudio();

    ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "ended"].forEach((eventName) => {
      audio.addEventListener(eventName, updateAudioUi);
    });

    audio.addEventListener("ended", () => {
      if (!state.submitted) scheduleAutoAdvanceAfterAudioEnd();
    });

    const volume = $("volumeRange");
    if (volume) {
      volume.addEventListener("input", (event) => {
        audioController.setVolume(event.target.value);
      });
    }
  }

  function bindUI() {
    $("authBtn").addEventListener("click", handleAuth);

    document.querySelectorAll("[data-exam-type]").forEach((button) => {
      button.addEventListener("click", () => {
        state.examType = button.dataset.examType;
        state.roundListExpanded = false;
        setActiveButtons("[data-exam-type]", "examType", state.examType);
        renderRoundList();
      });
    });

    document.querySelectorAll("[data-generation-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.generationMode = button.dataset.generationMode;
        state.roundListExpanded = false;
        setActiveButtons("[data-generation-mode]", "generationMode", state.generationMode);
        renderRoundList();
      });
    });

    $("teacherPrintBtn").addEventListener("click", openTeacherPrint);
    $("startBtn").addEventListener("click", startExam);

    $("prevBtn").addEventListener("click", () => {
      if (state.currentScreenIndex > 0) {
        clearAutoAdvanceTimer();
        state.currentScreenIndex -= 1;
        renderCurrentScreen();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    $("nextBtn").addEventListener("click", () => {
      clearAutoAdvanceTimer();
      goToNextScreen(false);
    });

    $("submitBtnBottom").addEventListener("click", () => {
      const submitButton = $("submitBtnBottom");
      if (submitButton && !submitButton.classList.contains("visible")) return;

      const flat = flattenItems(state.currentExam || {});
      const unanswered = flat.filter((item) => !state.answers[String(item.question_number)]).length;
      const message = unanswered > 0
        ? `미응답 문항이 ${unanswered}개 있습니다. 제출하시겠습니까?`
        : "제출하시겠습니까?";
      if (window.confirm(message)) submitExam();
    });

    bindAudioEvents();
  }

  bindUI();

  if (isWrongReviewRequested()) {
    loadInitialData().finally(() => {
      if (!startWrongReviewMode()) {
        loadInitialData();
      }
    });
  } else {
    loadInitialData();
  }
})();
