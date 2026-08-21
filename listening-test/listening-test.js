(function () {
  "use strict";

  const WRONG_REVIEW_SCOPE_VERSION = "topik2_wrong_review_current_result_v5";

  const MANIFEST_URL = "./data/exam-manifest.json";
  const BANK_URL = "./data/bank/question-bank.json";
  const APP_PUBLIC_TITLE = "Юү багшийн TOPIK 2 сонсох шалгалт";
  const RANDOM_BANK_PUBLIC_LABEL = "통합 문제은행";


  const QUESTION_PRACTICE_TYPES = [
    { key: "visual_graph_choice", label: "1~3 그림/그래프", questionNumbers: [1, 2, 3] },
    { key: "following_response", label: "4~8 이어질 수 있는 말", questionNumbers: [4, 5, 6, 7, 8] },
    { key: "next_action", label: "9~12 여자가 이어서 할 행동", questionNumbers: [9, 10, 11, 12] },
    { key: "same_content_single", label: "13~16 내용 일치", questionNumbers: [13, 14, 15, 16] },
    { key: "main_thought_single", label: "17~20 남자의 중심 생각", questionNumbers: [17, 18, 19, 20] },
    { key: "set_021_022", label: "21~22 중심 생각+내용 일치", questionNumbers: [21, 22] },
    { key: "set_023_024", label: "23~24 행동·의도+내용 일치", questionNumbers: [23, 24] },
    { key: "set_025_026", label: "25~26 중심 생각+내용 일치", questionNumbers: [25, 26] },
    { key: "set_027_028", label: "27~28 말하는 의도+내용 일치", questionNumbers: [27, 28] },
    { key: "set_029_030", label: "29~30 여자 신분+내용 일치", questionNumbers: [29, 30] },
    { key: "set_031_032", label: "31~32 중심 생각+태도", questionNumbers: [31, 32] },
    { key: "set_033_034", label: "33~34 주제·내용+내용 일치", questionNumbers: [33, 34] },
    { key: "set_035_036", label: "35~36 행동·의도+내용 일치", questionNumbers: [35, 36] },
    { key: "set_037_038", label: "37~38 여자 중심 생각+내용 일치", questionNumbers: [37, 38] },
    { key: "set_039_040", label: "39~40 대화 전 내용+내용 일치", questionNumbers: [39, 40] },
    { key: "set_041_042", label: "41~42 강연 중심 내용+내용 일치", questionNumbers: [41, 42] },
    { key: "set_043_044", label: "43~44 내용·이유 파악", questionNumbers: [43, 44] },
    { key: "set_045_046", label: "45~46 내용 일치+말하는 방식", questionNumbers: [45, 46] },
    { key: "set_047_048", label: "47~48 내용 일치+태도", questionNumbers: [47, 48] },
    { key: "set_049_050", label: "49~50 내용 일치+말하는 방식", questionNumbers: [49, 50] }
  ];

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
    activeCountdown: null,
    flowRunId: 0,
    submitted: false,
    wrongReviewSourceResult: null,
    isQuestionPracticeMode: false,
    questionPracticePause: {
      paused: false,
      pausedAt: 0,
      phase: "",
      remainingSeconds: null,
      wasAudioPlaying: false,
      audioUrl: ""
    },
    questionPracticePanelExpanded: false,
    questionPractice: {
      enabled: false,
      range: "",
      rawQuestionNumbers: [],
      questionNumbers: [],
      label: "",
      typeLabel: "",
      sourceExamIds: []
    }
  };

  window.__TOPIK2_LISTENING_DEBUG__ = {
    state,
    getQuestionPracticeState: () => cloneJson(state.questionPractice),
    getCurrentExam: () => state.currentExam,
    getScreens: () => state.screens
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
    const round = String(item?.source_round || item?.review_source_round || item?.generated_exam_round || item?.round || "").trim();
    const originalNumber = Number(item?.original_question_number || item?.review_source_question_number || item?.question_number || 0);
    return round && originalNumber ? `${round}|${originalNumber}` : "";
  }

  function sourceResultId(sourceResult) {
    if (!sourceResult) return "";
    const explicit = sourceResult.result_id || sourceResult.exam_result_id || sourceResult.review_source_id || sourceResult.wrong_review_source_id || "";
    if (explicit) return String(explicit);
    const base = [
      sourceResult.submitted_at || "",
      sourceResult.started_at || "",
      sourceResult.test_name || sourceResult.generated_exam_label || "",
      sourceResult.generated_exam_mode || "",
      sourceResult.generated_exam_round || sourceResult.source_round || "",
      sourceResult.student_name || "",
      sourceResult.student_phone || "",
      sourceResult.total_questions || "",
      sourceResult.earned_points || "",
      sourceResult.correct_count || "",
      sourceResult.unanswered_count || ""
    ].join("|");
    return base || "topik2-current-diagnosis";
  }

  function candidateReviewKeys(item) {
    const keys = new Set();
    if (!item) return keys;
    if (item.id) keys.add(String(item.id));
    if (item.review_source_original_key) keys.add(String(item.review_source_original_key));
    const originalKey = originalReviewKey(item);
    if (originalKey) keys.add(originalKey);

    const round = String(item.source_round || item.review_source_round || item.generated_exam_round || item.round || "").trim();
    const originalNumber = Number(item.original_question_number || item.review_source_question_number || 0);
    const displayNumber = Number(item.question_number || 0);
    if (round && originalNumber) keys.add(`${round}|${originalNumber}`);
    if (round && displayNumber) keys.add(`${round}|display:${displayNumber}`);
    if (displayNumber) {
      keys.add(`display:${displayNumber}`);
      keys.add(`qn:${displayNumber}`);
    }
    return keys;
  }

  function emptyWrongReviewProgress(sourceId) {
    return {
      scopeVersion: WRONG_REVIEW_SCOPE_VERSION,
      currentResultOnly: true,
      sourceId: sourceId || "",
      resolvedKeys: [],
      solvedNumbers: [],
      attempts: []
    };
  }

  function normalizeWrongReviewProgress(parsed, sourceResult) {
    const currentSourceId = sourceResultId(sourceResult);
    const empty = emptyWrongReviewProgress(currentSourceId);
    if (!parsed || typeof parsed !== "object" || !currentSourceId) return empty;

    const storedSourceId = String(parsed.sourceId || parsed.source_id || "");
    const scopeVersion = String(parsed.scopeVersion || parsed.scope_version || "");
    const currentResultOnly = parsed.currentResultOnly === true;

    if (storedSourceId !== currentSourceId) return empty;
    if (scopeVersion !== WRONG_REVIEW_SCOPE_VERSION || !currentResultOnly) return empty;

    return {
      scopeVersion: WRONG_REVIEW_SCOPE_VERSION,
      currentResultOnly: true,
      sourceId: currentSourceId,
      resolvedKeys: []
        .concat(Array.isArray(parsed.resolvedKeys) ? parsed.resolvedKeys : [])
        .concat(Array.isArray(parsed.solvedKeys) ? parsed.solvedKeys : [])
        .concat(Array.isArray(parsed.resolved_keys) ? parsed.resolved_keys : [])
        .map(String)
        .filter(Boolean),
      solvedNumbers: []
        .concat(Array.isArray(parsed.solvedNumbers) ? parsed.solvedNumbers : [])
        .concat(Array.isArray(parsed.solved_numbers) ? parsed.solved_numbers : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : []
    };
  }

  function getWrongReviewProgress(sourceResult) {
    try {
      const raw = localStorage.getItem("topik2_wrong_review_progress") || sessionStorage.getItem("topik2_wrong_review_progress");
      const parsed = raw ? JSON.parse(raw) : {};
      return normalizeWrongReviewProgress(parsed, sourceResult);
    } catch (error) {
      return emptyWrongReviewProgress(sourceResultId(sourceResult));
    }
  }

  function saveWrongReviewProgress(progress, sourceResult) {
    const sourceId = sourceResultId(sourceResult) || progress.sourceId || "";
    const safe = {
      scopeVersion: WRONG_REVIEW_SCOPE_VERSION,
      currentResultOnly: true,
      sourceId,
      resolvedKeys: Array.from(new Set((progress.resolvedKeys || []).map(String).filter(Boolean))),
      solvedNumbers: Array.from(new Set((progress.solvedNumbers || []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))),
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
    const solvedNumbers = new Set(
      (Array.isArray(progress.solvedNumbers) ? progress.solvedNumbers : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    );

    return (Array.isArray(sourceResult?.items) ? sourceResult.items : [])
      .filter((item) => !item.is_correct)
      .filter((item) => {
        for (const key of candidateReviewKeys(item)) {
          if (resolved.has(key)) return false;
        }

        // STEP14 안전장치:
        // resolvedKeys가 일부 구버전 오답풀이 결과와 매칭되지 않더라도
        // 원 진단 보고서의 표시 번호가 solvedNumbers에 있으면 다시 출제하지 않는다.
        const sourceDisplayNumber = Number(item.question_number || 0);
        if (sourceDisplayNumber && solvedNumbers.has(sourceDisplayNumber)) return false;

        return true;
      });
  }

  function countUnresolvedWrongItems(sourceResult) {
    return getUnresolvedWrongItems(sourceResult).length;
  }

  function updateWrongReviewProgress(sourceResult, reviewResult) {
    const progress = getWrongReviewProgress(sourceResult);
    const resolved = new Set(progress.resolvedKeys || []);

    // STEP14:
    // 원 진단 문항의 모든 후보 키를 source item과 연결해 둔다.
    // 이렇게 해야 오답풀이에서 맞힌 문항을 원 진단 보고서의 문항 번호로 정확히 차감할 수 있다.
    const originalWrongKeyToItem = new Map();
    getUnresolvedWrongItems(sourceResult).forEach((sourceItem) => {
      candidateReviewKeys(sourceItem).forEach((key) => {
        if (key && !originalWrongKeyToItem.has(key)) {
          originalWrongKeyToItem.set(key, sourceItem);
        }
      });
    });

    const correctedNow = [];
    const correctedSourceNumbers = new Set();

    (Array.isArray(reviewResult?.items) ? reviewResult.items : []).forEach((reviewItem) => {
      if (!reviewItem.is_correct) return;

      const keys = Array.from(candidateReviewKeys(reviewItem)).filter(Boolean);
      const matchedKey = keys.find((key) => originalWrongKeyToItem.has(key));
      if (!matchedKey) return;

      const sourceItem = originalWrongKeyToItem.get(matchedKey);

      // matched key와 review item/source item의 모든 후보 키를 함께 저장한다.
      // 이후 오답풀이를 다시 열 때 같은 문항이 재출제되지 않도록 하기 위함이다.
      keys.forEach((key) => resolved.add(key));
      candidateReviewKeys(sourceItem).forEach((key) => {
        if (key) resolved.add(key);
      });

      const sourceDisplayNumber = Number(sourceItem?.question_number || 0);
      if (sourceDisplayNumber) correctedSourceNumbers.add(sourceDisplayNumber);

      correctedNow.push({
        key: matchedKey,
        sourceQuestionNumber: sourceDisplayNumber || "",
        reviewQuestionNumber: Number(reviewItem.question_number || 0) || "",
        originalQuestionNumber: Number(sourceItem?.original_question_number || reviewItem.original_question_number || 0) || "",
        sourceRound: String(sourceItem?.source_round || reviewItem.source_round || "")
      });
    });

    const solvedNumbers = new Set(
      (Array.isArray(progress.solvedNumbers) ? progress.solvedNumbers : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    );
    correctedSourceNumbers.forEach((num) => solvedNumbers.add(num));

    progress.resolvedKeys = Array.from(resolved);
    progress.solvedNumbers = Array.from(solvedNumbers).sort((a, b) => a - b);
    progress.scopeVersion = WRONG_REVIEW_SCOPE_VERSION;
    progress.currentResultOnly = true;
    progress.sourceId = sourceResultId(sourceResult);
    progress.attempts = [
      ...(progress.attempts || []),
      {
        submittedAt: new Date().toISOString(),
        sourceId: sourceResultId(sourceResult),
        sourceTestName: sourceResult?.test_name || sourceResult?.generated_exam_label || "",
        reviewTestName: reviewResult?.test_name || "TOPIK II 듣기 오답 다시 풀기",
        reviewedCount: Array.isArray(reviewResult?.items) ? reviewResult.items.length : 0,
        correctedCount: correctedNow.length,
        correctedKeys: correctedNow.map((entry) => entry.key),
        correctedItems: correctedNow
      }
    ];

    const savedProgress = saveWrongReviewProgress(progress, sourceResult);

    return {
      progress: savedProgress,
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
      title: `${APP_PUBLIC_TITLE} 오답 다시 풀기`,
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
    // 현재 원 진단 결과 전용 오답풀이 scope를 보장한다. legacy progress는 여기서 무시된다.
    saveWrongReviewProgress(getWrongReviewProgress(sourceResult), sourceResult);
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
    return rounds.length ? RANDOM_BANK_PUBLIC_LABEL : "문제은행";
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


  function getExamLabel(entry) {
    return entry?.public_short_label || entry?.public_label || entry?.short_label || entry?.label || entry?.source_round || entry?.exam_id || "";
  }

  function getExamSourceDisplayLabel(entry, fallbackRound) {
    const publicLabel = entry?.public_short_label || entry?.public_label;
    if (publicLabel) return String(publicLabel).replace(/\s*레벨테스트.*$/, "");
    const base = getExamLabel(entry);
    if (base) return String(base).replace(/\s*레벨테스트.*$/, "");
    return fallbackRound ? `${fallbackRound}회` : "";
  }

  function getQuestionPracticeAvailableExams() {
    if (!state.manifest || !Array.isArray(state.manifest.exams)) return [];
    return state.manifest.exams.filter((entry) =>
      entry.enabled !== false &&
      entry.student_visible !== false &&
      entry.exam_type === "full" &&
      entry.test_file
    );
  }

  function isQuestionPracticeAvailable() {
    return state.examType === "full" && state.generationMode === "fixed";
  }

  function getQuestionPracticeType(typeKey) {
    return QUESTION_PRACTICE_TYPES.find((type) => type.key === typeKey) || null;
  }

  function getQuestionPracticeEntrySortValue(entry) {
    const raw = String(entry?.source_round || entry?.short_label || entry?.label || entry?.exam_id || "").trim();
    const numeric = Number((raw.match(/\d+/) || [""])[0]);
    return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
  }

  function sortQuestionPracticeEntries(entries) {
    return (entries || []).slice().sort((a, b) => {
      const na = getQuestionPracticeEntrySortValue(a);
      const nb = getQuestionPracticeEntrySortValue(b);
      if (na !== nb) return na - nb;
      return String(a?.exam_id || a?.label || "").localeCompare(String(b?.exam_id || b?.label || ""), "ko");
    });
  }

  function getQuestionPracticeSelectedEntries() {
    const exams = sortQuestionPracticeEntries(getQuestionPracticeAvailableExams());
    const selected = new Set(state.questionPractice.sourceExamIds || []);
    const entries = exams.filter((entry) => selected.has(entry.exam_id));
    if (entries.length > 0) return sortQuestionPracticeEntries(entries);

    if (state.selectedExamEntry && state.selectedExamEntry.exam_type === "full") {
      return sortQuestionPracticeEntries([state.selectedExamEntry]);
    }
    return [];
  }

  function syncQuestionPracticeSourceExams() {
    const exams = getQuestionPracticeAvailableExams();
    const validIds = new Set(exams.map((entry) => entry.exam_id));
    state.questionPractice.sourceExamIds = (state.questionPractice.sourceExamIds || []).filter((id) => validIds.has(id));

    if (
      isQuestionPracticeAvailable() &&
      state.questionPractice.sourceExamIds.length === 0 &&
      state.selectedExamEntry &&
      state.selectedExamEntry.exam_type === "full" &&
      validIds.has(state.selectedExamEntry.exam_id)
    ) {
      state.questionPractice.sourceExamIds = [state.selectedExamEntry.exam_id];
    }
  }

  function renderQuestionPracticeTypeButtons() {
    const grid = $("questionPracticeTypeGrid");
    if (!grid) return;
    grid.innerHTML = "";

    QUESTION_PRACTICE_TYPES.forEach((type) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "question-practice-range-btn";
      btn.dataset.questionPracticeType = type.key;
      btn.textContent = type.label;
      btn.addEventListener("click", () => applyQuestionPracticeSelection(type.key));
      grid.appendChild(btn);
    });
  }

  function setQuestionPracticePanelExpanded(expanded) {
    state.questionPracticePanelExpanded = Boolean(expanded);
    const panel = $("questionPracticePanel");
    const toggle = $("questionPracticeToggleBtn");
    if (panel) {
      panel.classList.toggle("collapsed", !state.questionPracticePanelExpanded);
      panel.classList.toggle("expanded", state.questionPracticePanelExpanded);
    }
    if (toggle) {
      toggle.classList.toggle("active", state.questionPracticePanelExpanded);
      toggle.setAttribute("aria-expanded", state.questionPracticePanelExpanded ? "true" : "false");
      toggle.textContent = state.questionPracticePanelExpanded ? "문항 선택 연습 닫기" : "문항 선택 연습 열기";
    }
  }

  function toggleQuestionPracticePanel() {
    setQuestionPracticePanelExpanded(!state.questionPracticePanelExpanded);
  }

  function updateQuestionPracticeStatus(message, active) {
    const status = $("questionPracticeStatus");
    if (!status) return;

    if (message) {
      status.textContent = message;
      status.classList.toggle("active", Boolean(active));
      return;
    }

    if (!isQuestionPracticeAvailable()) {
      status.textContent = "문항 선택 연습은 50문항 실전시험 · 회차별 시험지에서만 사용할 수 있습니다.";
      status.classList.remove("active");
      return;
    }

    const entries = getQuestionPracticeSelectedEntries();
    if (!state.questionPractice.enabled) {
      const roundText = entries.map(getExamLabel).join(", ");
      status.textContent = roundText
        ? `${roundText} 선택됨 · 유형을 선택하지 않으면 전체 시험으로 진행합니다.`
        : "연습 회차를 선택한 뒤 유형을 선택하세요.";
      status.classList.remove("active");
      return;
    }

    const count = state.questionPractice.questionNumbers.length * entries.length;
    const roundText = entries.map(getExamLabel).join(", ");
    status.textContent = `${roundText} ${state.questionPractice.typeLabel} 연습 적용 중 (${count}문항 기준, 세트는 자동 포함)`;
    status.classList.add("active");
  }

  function renderQuestionPracticeRoundList() {
    const list = $("questionPracticeRoundList");
    if (!list) return;

    syncQuestionPracticeSourceExams();
    list.innerHTML = "";

    const available = isQuestionPracticeAvailable();
    const exams = getQuestionPracticeAvailableExams();

    if (!available) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "question-practice-round-btn";
      btn.disabled = true;
      btn.textContent = "50문항 실전시험 · 회차별 시험지에서 사용 가능";
      list.appendChild(btn);
      updateQuestionPracticeStatus();
      return;
    }

    if (exams.length === 0) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "question-practice-round-btn";
      btn.disabled = true;
      btn.textContent = "연습 가능한 회차가 없습니다.";
      list.appendChild(btn);
      updateQuestionPracticeStatus();
      return;
    }

    const selected = new Set(state.questionPractice.sourceExamIds || []);
    exams.forEach((entry) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "question-practice-round-btn";
      btn.dataset.questionPracticeExamId = entry.exam_id;
      btn.textContent = getExamLabel(entry);
      btn.classList.toggle("active", selected.has(entry.exam_id));
      btn.addEventListener("click", () => toggleQuestionPracticeSourceExam(entry.exam_id));
      list.appendChild(btn);
    });

    updateQuestionPracticeStatus();
  }

  function updateQuestionPracticeAvailability() {
    const available = isQuestionPracticeAvailable();
    const panel = $("questionPracticePanel");
    const toggle = $("questionPracticeToggleBtn");

    if (panel) panel.classList.toggle("disabled", !available);
    if (toggle) toggle.disabled = false;

    document.querySelectorAll("[data-question-practice-type]").forEach((button) => {
      button.disabled = !available;
      button.classList.toggle("active", state.questionPractice.enabled && button.dataset.questionPracticeType === state.questionPractice.range);
    });

    renderQuestionPracticeRoundList();
    updateStartButton();
  }

  function toggleQuestionPracticeSourceExam(examId) {
    if (!isQuestionPracticeAvailable()) return;

    const ids = new Set(state.questionPractice.sourceExamIds || []);
    if (ids.has(examId)) ids.delete(examId);
    else ids.add(examId);

    state.questionPractice.sourceExamIds = Array.from(ids);
    renderQuestionPracticeRoundList();
    updateStartButton();
  }

  function applyQuestionPracticeSelection(typeKey) {
    if (!isQuestionPracticeAvailable()) {
      updateQuestionPracticeStatus("문항 선택 연습은 50문항 실전시험 · 회차별 시험지에서만 사용할 수 있습니다.", false);
      return;
    }

    const type = getQuestionPracticeType(typeKey);
    if (!type) return;

    syncQuestionPracticeSourceExams();
    state.questionPractice.enabled = true;
    state.questionPractice.range = type.key;
    state.questionPractice.rawQuestionNumbers = type.questionNumbers.slice();
    state.questionPractice.questionNumbers = type.questionNumbers.slice();
    state.questionPractice.label = type.label;
    state.questionPractice.typeLabel = type.label;

    document.querySelectorAll("[data-question-practice-type]").forEach((button) => {
      button.classList.toggle("active", button.dataset.questionPracticeType === type.key);
    });

    updateQuestionPracticeStatus();
    updateStartButton();
  }

  function clearQuestionPracticeSelection() {
    state.questionPractice.enabled = false;
    state.questionPractice.range = "";
    state.questionPractice.rawQuestionNumbers = [];
    state.questionPractice.questionNumbers = [];
    state.questionPractice.label = "";
    state.questionPractice.typeLabel = "";

    document.querySelectorAll("[data-question-practice-type]").forEach((button) => {
      button.classList.remove("active");
    });

    updateQuestionPracticeStatus();
    updateStartButton();
  }

  function syncQuestionPracticeStateFromDom() {
    if (!isQuestionPracticeAvailable()) return;

    const activeTypeButton = document.querySelector("[data-question-practice-type].active");
    if (activeTypeButton) {
      const type = getQuestionPracticeType(activeTypeButton.dataset.questionPracticeType);
      if (type) {
        state.questionPractice.enabled = true;
        state.questionPractice.range = type.key;
        state.questionPractice.rawQuestionNumbers = type.questionNumbers.slice();
        state.questionPractice.questionNumbers = type.questionNumbers.slice();
        state.questionPractice.label = type.label;
        state.questionPractice.typeLabel = type.label;
      }
    }

    const activeRoundIds = Array.from(document.querySelectorAll("[data-question-practice-exam-id].active"))
      .map((button) => button.dataset.questionPracticeExamId)
      .filter(Boolean);

    if (activeRoundIds.length > 0) {
      state.questionPractice.sourceExamIds = activeRoundIds;
    }

    syncQuestionPracticeSourceExams();
  }

  function isQuestionPracticeUiSelected() {
    return Boolean(
      document.querySelector("[data-question-practice-type].active") ||
      state.questionPractice.enabled ||
      (state.questionPractice.range && Array.isArray(state.questionPractice.questionNumbers) && state.questionPractice.questionNumbers.length > 0)
    );
  }

  function shouldUseQuestionPracticeSelection() {
    syncQuestionPracticeStateFromDom();
    return (
      isQuestionPracticeAvailable() &&
      state.questionPractice.enabled &&
      Array.isArray(state.questionPractice.questionNumbers) &&
      state.questionPractice.questionNumbers.length > 0 &&
      getQuestionPracticeSelectedEntries().length > 0
    );
  }

  function getScreenSourceQuestionNumbers(screen) {
    return (screen?.questions || [])
      .map((question) => Number(question.original_question_number || question.question_number))
      .filter(Boolean);
  }

  function screenMatchesPracticeNumbers(screen, selectedNumberSet) {
    return getScreenSourceQuestionNumbers(screen).some((number) => selectedNumberSet.has(Number(number)));
  }

  function getSourceRoundForPractice(exam, entry, item) {
    return String(
      item?.source_round ||
      entry?.source_round ||
      exam?.source_round ||
      exam?.source_round_label ||
      exam?.round ||
      ""
    ).trim();
  }

  function normalizePracticeInstruction(originalInstruction, startNumber, endNumber) {
    if (startNumber === endNumber) return originalInstruction || "";
    const pointMatch = String(originalInstruction || "").match(/\([^)]*점[^)]*\)/);
    const pointText = pointMatch ? ` ${pointMatch[0]}` : "";
    return `[${startNumber}~${endNumber}] 다음을 듣고 물음에 답하십시오.${pointText}`;
  }

  function normalizeQuestionForPractice(question, displayNumber, sourceExam, sourceEntry) {
    const originalNumber = Number(question.original_question_number || question.question_number || displayNumber);
    const sourceRound = getSourceRoundForPractice(sourceExam, sourceEntry, question);
    const sourceDisplayLabel = getExamSourceDisplayLabel(sourceEntry, sourceRound);
    const sourceLabel = `${sourceDisplayLabel} ${originalNumber}번`.trim();

    const normalized = cloneJson(question);
    normalized.question_number = displayNumber;
    normalized.original_question_number = originalNumber;
    normalized.source_question_number = originalNumber;
    normalized.source_round = sourceRound || normalized.source_round || sourceExam?.source_round || "";
    normalized.generated_exam_round = sourceRound || normalized.source_round || "";
    normalized.question_practice_source_label = sourceLabel;
    normalized.id = `QP_${String(displayNumber).padStart(3, "0")}_SRC_${String(sourceRound || sourceExam?.exam_id || "ROUND")}_${String(originalNumber).padStart(3, "0")}`;
    return normalized;
  }

  function buildQuestionPracticeScreen(sourceExam, sourceEntry, screen, displayStart) {
    const sourceNumbers = getScreenSourceQuestionNumbers(screen);
    const startNumber = displayStart;
    const questions = (screen.questions || []).map((question, idx) =>
      normalizeQuestionForPractice(question, displayStart + idx, sourceExam, sourceEntry)
    );

    if (questions.length === 0) return null;

    if (questions.length === 1) {
      const single = questions[0];
      single.audio_url = single.audio_url || screen.entry?.audio_url || "";
      return {
        item: single,
        renderUnit: {
          unit_type: "single",
          question_numbers: [startNumber],
          source_question_numbers: sourceNumbers,
          audio_url: single.audio_url || "",
          instruction: single.instruction || screen.entry?.instruction || ""
        },
        nextDisplayNumber: displayStart + 1
      };
    }

    const endNumber = displayStart + questions.length - 1;
    const sourceRound = getSourceRoundForPractice(sourceExam, sourceEntry, questions[0]);
    const setId = `QP_SET_${String(startNumber).padStart(3, "0")}_${String(endNumber).padStart(3, "0")}_SRC_${String(sourceRound || sourceExam?.exam_id || "ROUND")}_${sourceNumbers.join("_")}`;
    const audioUrl = screen.entry?.audio_url || questions[0]?.audio_url || "";

    questions.forEach((question) => {
      question.set_id = setId;
      question.audio_url = question.audio_url || audioUrl;
    });

    const setEntry = cloneJson(screen.entry || {});
    setEntry.set_id = setId;
    setEntry.source_round = sourceRound || setEntry.source_round || sourceExam?.source_round || "";
    setEntry.target_slots = questions.map((question) => Number(question.question_number));
    setEntry.audio_group_numbers = questions.map((question) => Number(question.question_number));
    setEntry.original_target_slots = sourceNumbers;
    setEntry.source_question_numbers = sourceNumbers;
    setEntry.audio_url = audioUrl;
    setEntry.instruction = normalizePracticeInstruction(setEntry.instruction, startNumber, endNumber);
    const sourceDisplayLabel = getExamSourceDisplayLabel(sourceEntry, sourceRound);
    setEntry.question_practice_source_label = `${sourceDisplayLabel} ${sourceNumbers.join("·")}번`.trim();
    setEntry.items = questions;

    return {
      item: setEntry,
      renderUnit: {
        unit_type: "question_set",
        question_numbers: questions.map((question) => Number(question.question_number)),
        source_question_numbers: sourceNumbers,
        audio_url: audioUrl,
        instruction: setEntry.instruction,
        set_id: setId,
        audio_group_id: setEntry.audio_group_id || setId
      },
      nextDisplayNumber: displayStart + questions.length
    };
  }

  async function buildQuestionPracticeExamAndAnswerKey() {
    const entries = getQuestionPracticeSelectedEntries();
    const selectedNumbers = new Set(state.questionPractice.questionNumbers.map(Number));
    const generatedItems = [];
    const renderSequence = [];
    const sourceRoundLabels = [];
    const sourceRounds = [];
    let display = 1;
    let autoIncludedSetQuestions = false;

    for (const entry of entries) {
      const sourceExam = await fetchJson(entry.test_file);
      const sourceScreens = makeScreens(sourceExam);
      sourceRoundLabels.push(getExamLabel(entry));
      sourceRounds.push(String(sourceExam.source_round || entry.source_round || entry.exam_id || ""));

      sourceScreens.forEach((screen) => {
        if (!screenMatchesPracticeNumbers(screen, selectedNumbers)) return;

        const sourceNumbers = getScreenSourceQuestionNumbers(screen);
        const matchedCount = sourceNumbers.filter((number) => selectedNumbers.has(Number(number))).length;
        if (sourceNumbers.length > matchedCount) autoIncludedSetQuestions = true;

        const generated = buildQuestionPracticeScreen(sourceExam, entry, screen, display);
        if (!generated) return;

        generatedItems.push(generated.item);
        renderSequence.push(generated.renderUnit);
        display = generated.nextDisplayNumber;
      });
    }

    if (generatedItems.length === 0) {
      throw new Error("선택한 회차에서 해당 유형 문항을 찾지 못했습니다. exam JSON의 문항 번호와 세트 구조를 확인하세요.");
    }

    const totalQuestions = display - 1;
    const flatGeneratedItems = window.TopikResultBuilder.normalizeQuestionItems(generatedItems);
    const totalPossiblePoints = flatGeneratedItems.reduce((sum, item) => sum + (Number(item.points) || 2), 0);
    const roundText = sourceRoundLabels.join(", ");
    const typeLabel = state.questionPractice.typeLabel || state.questionPractice.label || "선택 유형";

    console.info("[question-practice] generated exam", {
      sourceRoundLabels,
      typeLabel,
      totalQuestions,
      totalScreens: renderSequence.length,
      requestedQuestionNumbers: state.questionPractice.questionNumbers.slice()
    });

    return {
      exam_id: `question-practice-${Date.now()}`,
      source_round: sourceRounds.filter(Boolean).join(","),
      source_rounds: sourceRounds.filter(Boolean),
      source_round_labels: sourceRoundLabels,
      title: `${APP_PUBLIC_TITLE} 문항 선택 연습`,
      level: "TOPIK II",
      section: "listening",
      exam_type: "question-practice",
      generated_exam_mode: "question-practice",
      generated_exam_label: `${roundText} ${typeLabel} 연습`,
      test_scope: `여러 회차 동일 유형 연습: ${roundText} / ${typeLabel}`,
      total_questions: totalQuestions,
      total_possible_points: totalPossiblePoints,
      time_limit_minutes: Math.max(10, Math.ceil(totalQuestions * 1.2)),
      audio_mode: "manual",
      guide_audio: entries.length === 1 ? "" : "",
      render_sequence: renderSequence,
      items: generatedItems,
      question_practice_selection: {
        mode: "multi-round-type-practice",
        source_exam_ids: entries.map((entry) => entry.exam_id),
        source_rounds: sourceRounds.filter(Boolean),
        source_round_labels: sourceRoundLabels,
        requested_question_numbers: state.questionPractice.questionNumbers.slice(),
        selected_type_label: typeLabel,
        total_selected_rounds: entries.length,
        total_questions: totalQuestions,
        set_questions_auto_included: autoIncludedSetQuestions
      }
    };
  }


  function setActiveButtons(selector, attrName, value) {
    document.querySelectorAll(selector).forEach((button) => {
      button.classList.toggle("active", button.dataset[attrName] === value);
    });
  }

  function updateStartButton() {
    const hasExam = shouldUseQuestionPracticeSelection()
      ? true
      : (state.generationMode === "random"
        ? Boolean(state.bank)
        : Boolean(state.selectedExamEntry));
    $("startBtn").disabled = !hasExam;
  }

  function renderRoundList() {
    const list = $("roundList");
    list.innerHTML = "";

    const exams = getVisibleExams();
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
      updateQuestionPracticeAvailability();
      updateStartButton();
      return;
    }

    if (exams.length === 0) {
      list.innerHTML = "<div class='note-box'>등록된 회차가 없습니다.</div>";
      state.selectedExamEntry = null;
      state.roundListExpanded = false;
      $("selectedExamText").textContent = "";
      updateQuestionPracticeAvailability();
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
    // STEP09-97: 회차 선택 드롭다운의 선택 회차 문구를 버튼 중앙에 고정한다.
    // 기존 space-between 배치는 오른쪽 화살표 때문에 "97회"가 왼쪽으로 치우쳐 보였다.
    toggleBtn.style.justifyContent = "center";
    toggleBtn.style.gap = "12px";
    toggleBtn.style.position = "relative";
    toggleBtn.style.paddingLeft = "42px";
    toggleBtn.style.paddingRight = "42px";
    toggleBtn.setAttribute("aria-expanded", state.roundListExpanded ? "true" : "false");

    const selectedText = document.createElement("span");
    selectedText.textContent = getExamLabel(state.selectedExamEntry);
    selectedText.style.display = "block";
    selectedText.style.flex = "1 1 auto";
    selectedText.style.textAlign = "center";
    selectedText.style.pointerEvents = "none";

    const arrowText = document.createElement("span");
    arrowText.textContent = state.roundListExpanded ? "▲" : "▼";
    arrowText.style.fontSize = "14px";
    arrowText.style.flex = "0 0 auto";
    arrowText.style.position = "absolute";
    arrowText.style.right = "16px";
    arrowText.style.top = "50%";
    arrowText.style.transform = "translateY(-50%)";
    arrowText.style.pointerEvents = "none";

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
      btn.textContent = getExamLabel(entry);
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
      state.selectedExamEntry ? `${getExamLabel(state.selectedExamEntry)} 선택됨` : "";
    updateQuestionPracticeAvailability();
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

    renderQuestionPracticeTypeButtons();
    renderRoundList();
    updateQuestionPracticeAvailability();
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

  function findItemByQuestionNumber(flatItems, questionNumber) {
    const target = Number(questionNumber);
    const byDisplayNumber = flatItems.find((item) => Number(item.question_number) === target);
    if (byDisplayNumber) return byDisplayNumber;

    const exam = state.currentExam || {};
    const isPracticeExam = exam.exam_type === "question-practice" || exam.generated_exam_mode === "question-practice" || state.isQuestionPracticeMode;
    if (isPracticeExam) {
      return null;
    }

    return flatItems.find((item) => Number(item.original_question_number) === target) || null;
  }

  function normalizeRenderUnitQuestionNumbers(unit) {
    if (!unit) return [];
    if (Array.isArray(unit.question_numbers)) {
      return unit.question_numbers.map(Number).filter(Boolean);
    }
    if (Array.isArray(unit.target_questions)) {
      return unit.target_questions.map(Number).filter(Boolean);
    }
    if (Array.isArray(unit.target_slots)) {
      return unit.target_slots.map(Number).filter(Boolean);
    }
    if (Array.isArray(unit.audio_group_numbers)) {
      return unit.audio_group_numbers.map(Number).filter(Boolean);
    }
    if (unit.question_number) return [Number(unit.question_number)].filter(Boolean);
    return [];
  }

  function makeScreensFromRenderSequence(exam) {
    const renderSequence = Array.isArray(exam?.render_sequence) ? exam.render_sequence : [];
    if (renderSequence.length === 0) return [];

    const flatItems = flattenItems(exam);
    return renderSequence.map((unit) => {
      const questionNumbers = normalizeRenderUnitQuestionNumbers(unit);
      const questions = questionNumbers
        .map((number) => findItemByQuestionNumber(flatItems, number))
        .filter(Boolean);
      const missingQuestionNumbers = questionNumbers.filter((number) =>
        !questions.some((item) => Number(item.question_number) === Number(number) || Number(item.original_question_number) === Number(number))
      );

      const entry = {
        ...unit,
        instruction: unit.instruction || questions[0]?.instruction || "",
        audio_url: unit.audio_url || unit.question_audio || questions[0]?.audio_url || "",
        items: questions
      };

      return {
        type: questionNumbers.length > 1 ? "set" : "single",
        entry,
        questions,
        renderUnit: unit,
        missingQuestionNumbers
      };
    });
  }

  function makeScreens(exam) {
    const sequenceScreens = makeScreensFromRenderSequence(exam);
    if (sequenceScreens.length > 0) return sequenceScreens;

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
    if (state.screenTiming) state.screenTiming.phase = phase;
    updateQuestionPracticePauseControl();
  }

  function clearFlowTimers(options = {}) {
    window.clearInterval(state.solveTimerId);
    state.solveTimerId = null;
    if (!options.preserveCountdown) state.activeCountdown = null;
    clearAutoAdvanceTimer();
  }

  function runCountdown(phase, seconds, onDone) {
    clearFlowTimers();

    const runId = state.flowRunId;
    const duration = Math.max(0, Number(seconds) || 0);
    const endAt = Date.now() + duration * 1000;

    state.activeCountdown = { phase, endAt, onDone, runId };
    setPhaseActive(phase);

    const update = () => {
      if (runId !== state.flowRunId || state.submitted) {
        clearFlowTimers();
        return;
      }

      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));

      if (state.activeCountdown && state.activeCountdown.runId === runId) {
        state.activeCountdown.endAt = endAt;
      }

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

  function isQuestionPracticeExam() {
    const exam = state.currentExam || {};
    return Boolean(
      state.isQuestionPracticeMode ||
      exam.exam_type === "question-practice" ||
      exam.generated_exam_mode === "question-practice"
    );
  }

  function canUseQuestionPracticePause() {
    return Boolean(isQuestionPracticeExam() && state.currentExam && !state.submitted);
  }

  function resetQuestionPracticePauseState(adjustExamClock = false) {
    if (state.questionPracticePause && state.questionPracticePause.paused && adjustExamClock) {
      const pausedMs = Date.now() - Number(state.questionPracticePause.pausedAt || Date.now());
      if (Number.isFinite(pausedMs) && pausedMs > 0) state.examStartMs += pausedMs;
    }

    state.questionPracticePause = {
      paused: false,
      pausedAt: 0,
      phase: "",
      remainingSeconds: null,
      wasAudioPlaying: false,
      audioUrl: ""
    };
    updateQuestionPracticePauseControl();
  }

  function updateQuestionPracticePauseControl() {
    const status = $("audioStatusLabel");
    if (!status) return;

    const enabled = canUseQuestionPracticePause();
    status.classList.toggle("question-practice-pause-enabled", enabled);
    status.style.cursor = enabled ? "pointer" : "";
    status.setAttribute("role", enabled ? "button" : "status");
    status.setAttribute("tabindex", enabled ? "0" : "-1");
    status.title = enabled
      ? "문항 선택 연습에서는 이 버튼으로 오디오와 타이머를 일시정지/재개할 수 있습니다."
      : "";

    if (state.questionPracticePause && state.questionPracticePause.paused) {
      status.textContent = "다시 재생";
      status.classList.remove("playing");
    }
  }

  function pauseQuestionPracticeFlow() {
    if (!canUseQuestionPracticePause() || state.questionPracticePause.paused) return;

    const audio = audioController.getAudio();
    const phase = state.screenTiming?.phase ||
      ($("listenBox").classList.contains("active") ? "listen" :
        ($("solveBox").classList.contains("active") ? "solve" : "wait"));
    const activeCountdown = state.activeCountdown;
    const remainingSeconds = activeCountdown && activeCountdown.runId === state.flowRunId
      ? Math.max(0, Math.ceil((activeCountdown.endAt - Date.now()) / 1000))
      : null;

    state.questionPracticePause = {
      paused: true,
      pausedAt: Date.now(),
      phase,
      remainingSeconds,
      wasAudioPlaying: !audio.paused && !audio.ended,
      audioUrl: audioController.getCurrentUrl()
    };

    if (remainingSeconds !== null) {
      clearFlowTimers({ preserveCountdown: true });
    } else {
      clearAutoAdvanceTimer();
    }

    audioController.pause();
    window.clearInterval(state.remainTimerId);
    state.remainTimerId = null;
    updateQuestionPracticePauseControl();
  }

  function resumeQuestionPracticeFlow() {
    if (!state.questionPracticePause.paused) return;

    const pauseInfo = { ...state.questionPracticePause };
    const pausedMs = Date.now() - Number(pauseInfo.pausedAt || Date.now());
    if (Number.isFinite(pausedMs) && pausedMs > 0) state.examStartMs += pausedMs;

    state.questionPracticePause.paused = false;
    state.questionPracticePause.pausedAt = 0;
    startRemainTimer();

    if (pauseInfo.phase === "wait" || pauseInfo.phase === "solve") {
      const countdown = state.activeCountdown;
      if (countdown && countdown.runId === state.flowRunId && typeof countdown.onDone === "function") {
        runCountdown(countdown.phase || pauseInfo.phase, pauseInfo.remainingSeconds ?? 0, countdown.onDone);
      }
    } else if (pauseInfo.phase === "listen" && pauseInfo.audioUrl) {
      setPhaseActive("listen");
      audioController.play(pauseInfo.audioUrl).catch((error) => {
        const status = $("audioStatusLabel");
        if (status) status.textContent = "자동 재생 대기";
        console.warn("오디오 재개 대기:", error);
      });
    }

    updateAudioUi();
  }

  function toggleQuestionPracticePause() {
    if (!canUseQuestionPracticePause()) return;
    if (state.questionPracticePause.paused) resumeQuestionPracticeFlow();
    else pauseQuestionPracticeFlow();
  }

  function handleQuestionPracticePauseButton(event) {
    if (!canUseQuestionPracticePause()) return;
    event.preventDefault();
    toggleQuestionPracticePause();
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
    const practiceSourceLabel = question.question_practice_source_label
      ? `${String(question.question_practice_source_label).trim()}${String(question.question_practice_source_label).trim().endsWith("문항") ? "" : " 문항"}`
      : "";
    const original = practiceSourceLabel
      ? `<span class="source-q">${escapeHtml(practiceSourceLabel)}</span>`
      : (question.original_question_number && Number(question.original_question_number) !== qn
        ? `<span class="source-q">원문항 ${escapeHtml(question.original_question_number)}번</span>`
        : "");

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

    // 고정 회차, 레벨테스트, 10문항 단위 검수용 시험 모두
    // 실제 화면 배열의 마지막 화면에서만 제출 버튼을 보여 준다.
    // 문항 번호가 11~20, 21~30처럼 시작하는 검수용 JSON에서도 조기 제출 버튼이 뜨지 않게 한다.
    const isFinalScreen = state.currentScreenIndex >= state.screens.length - 1;

    button.classList.toggle("visible", isFinalScreen);
    button.disabled = !isFinalScreen;
  }

  function renderCurrentScreen() {
    if (state.questionPracticePause && state.questionPracticePause.paused) {
      resetQuestionPracticePauseState(true);
      if (!state.remainTimerId && state.currentExam && !state.submitted) startRemainTimer();
    }

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
    $("groupInstruction").textContent = screen.entry?.instruction || "";
    $("questionCounter").textContent = `${range} / ${totalQuestions}`;
    $("questionArea").classList.toggle("visual-area", hasVisualQuestion);

    if (!Array.isArray(screen.questions) || screen.questions.length === 0 || (screen.missingQuestionNumbers || []).length > 0) {
      console.error("[renderCurrentScreen] item not found", {
        screen,
        missingQuestionNumbers: screen.missingQuestionNumbers || [],
        renderUnit: screen.renderUnit || null
      });
      $("questionArea").innerHTML = '<div class="empty-question">문항 데이터와 오디오 순서가 맞지 않습니다. Console을 확인하세요.</div>';
      $("prevBtn").disabled = state.currentScreenIndex === 0;
      $("nextBtn").disabled = true;
      updateSubmitVisibility();
      updateAudioUi();
      renderProgress();
      return;
    }

    const setHtml = screen.type === "set"
      ? `<div class="set-paper">${screen.questions.map(renderQuestionPaper).join("")}</div>`
      : renderQuestionPaper(screen.questions[0]);

    $("questionArea").innerHTML = setHtml;

    if (currentAudio) {
      audioController.load(currentAudio);
    }

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

  function getBankItemOriginalNumber(item) {
    return Number(item?.original_question_number || item?.question_number || 0);
  }

  function getBankSetTargetSlots(entry) {
    const raw = entry?.target_slots || entry?.audio_group_numbers || [];
    return Array.isArray(raw) ? raw.map((num) => Number(num)).filter(Boolean) : [];
  }

  function sameNumberArray(a, b) {
    return Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => Number(value) === Number(b[index]));
  }

  function getBankEntryKey(entry) {
    const slots = getBankSetTargetSlots(entry).join("_");
    return [
      entry?.id || "",
      entry?.source_round || "",
      slots,
      entry?.audio_url || ""
    ].join("|");
  }

  function getBankDiagnostics(entry) {
    const values = [];
    if (entry?.diagnostic_area) values.push(entry.diagnostic_area);
    if (entry?.type) values.push(entry.type);
    (entry?.items || []).forEach((item) => {
      if (item?.diagnostic_area) values.push(item.diagnostic_area);
      if (item?.type) values.push(item.type);
    });
    return new Set(values.filter(Boolean));
  }

  function bankEntryHasDiagnostic(entry, diagnostic) {
    return getBankDiagnostics(entry).has(diagnostic);
  }

  function bankEntryHasDiagnosticArea(entry, diagnostic) {
    if (entry?.diagnostic_area === diagnostic) return true;
    return (entry?.items || []).some((item) => item?.diagnostic_area === diagnostic);
  }

  function pickOneBankEntry(candidates, message, usedKeys = null) {
    const available = shuffle(candidates).filter((entry) => {
      if (!usedKeys) return true;
      return !usedKeys.has(getBankEntryKey(entry));
    });
    if (!available.length) throw new Error(message);
    const selected = available[0];
    if (usedKeys) usedKeys.add(getBankEntryKey(selected));
    return cloneJson(selected);
  }

  function selectRandomSingleSlotsFromBank(singles) {
    const slotTypes = {
      1: "visual_graph_choice",
      2: "visual_graph_choice",
      3: "visual_graph_choice",
      4: "following_response",
      5: "following_response",
      6: "following_response",
      7: "following_response",
      8: "following_response",
      9: "next_action",
      10: "next_action",
      11: "next_action",
      12: "next_action",
      13: "same_content_single",
      14: "same_content_single",
      15: "same_content_single",
      16: "same_content_single",
      17: "main_thought_single",
      18: "main_thought_single",
      19: "main_thought_single",
      20: "main_thought_single"
    };

    return Array.from({ length: 20 }, (_, index) => index + 1).map((slotNo) => {
      const requiredType = slotTypes[slotNo];
      const exactCandidates = singles.filter((item) =>
        getBankItemOriginalNumber(item) === slotNo &&
        (!requiredType || item.type === requiredType)
      );

      const fallbackCandidates = singles.filter((item) =>
        getBankItemOriginalNumber(item) === slotNo ||
        (requiredType && item.type === requiredType)
      );

      return pickOneBankEntry(
        exactCandidates.length ? exactCandidates : fallbackCandidates,
        `${slotNo}번 슬롯 후보가 부족합니다.`
      );
    });
  }

  function selectRandomFullSetsFromBank(sets) {
    const setSlotPairs = [
      [21, 22],
      [23, 24],
      [25, 26],
      [27, 28],
      [29, 30],
      [31, 32],
      [33, 34],
      [35, 36],
      [37, 38],
      [39, 40],
      [41, 42],
      [43, 44],
      [45, 46],
      [47, 48],
      [49, 50]
    ];

    return setSlotPairs.map((pair) => {
      const candidates = sets.filter((entry) => sameNumberArray(getBankSetTargetSlots(entry), pair));
      return pickOneBankEntry(candidates, `${pair[0]}~${pair[1]}번 세트 후보가 부족합니다.`);
    });
  }

  function selectRandomLevelTestSetsFromBank(sets) {
    const levelSetSlots = [
      {
        display_slots: [21, 22],
        source_slots: [21, 22],
        required_diagnostic: "main_thought_set",
        label: "중심 생각(세트)"
      },
      {
        display_slots: [23, 24],
        source_slots: [23, 24],
        required_diagnostic: "speaker_action_intention",
        label: "행동·의도 파악"
      },
      {
        display_slots: [25, 26],
        source_slots: [29, 30],
        required_diagnostic: "speaker_identity",
        label: "화자 신분 파악"
      },
      {
        display_slots: [27, 28],
        source_slots: [41, 42],
        required_diagnostic: "topic_content",
        label: "주제·내용 파악"
      },
      {
        display_slots: [29, 30],
        source_slots: [49, 50],
        required_diagnostic: "attitude_method",
        label: "태도·말하는 방식"
      }
    ];

    const usedKeys = new Set();

    return levelSetSlots.map((slot) => {
      const exactCandidates = sets.filter((entry) =>
        sameNumberArray(getBankSetTargetSlots(entry), slot.source_slots) &&
        bankEntryHasDiagnosticArea(entry, slot.required_diagnostic)
      );

      const fallbackCandidates = sets.filter((entry) =>
        bankEntryHasDiagnosticArea(entry, slot.required_diagnostic)
      );

      const looseCandidates = sets.filter((entry) =>
        sameNumberArray(getBankSetTargetSlots(entry), slot.source_slots) &&
        bankEntryHasDiagnostic(entry, slot.required_diagnostic)
      );

      const looseFallbackCandidates = sets.filter((entry) =>
        bankEntryHasDiagnostic(entry, slot.required_diagnostic)
      );

      const selected = pickOneBankEntry(
        exactCandidates.length
          ? exactCandidates
          : (fallbackCandidates.length
            ? fallbackCandidates
            : (looseCandidates.length ? looseCandidates : looseFallbackCandidates)),
        `${slot.label} 세트 후보가 부족합니다.`,
        usedKeys
      );

      selected.random_level_test_source_slots = slot.source_slots.slice();
      selected.random_level_test_display_slots = slot.display_slots.slice();
      selected.random_level_test_required_diagnostic = slot.required_diagnostic;
      return selected;
    });
  }

  function generateRandomExamFromBank() {
    const bank = state.bank;
    if (!bank) throw new Error("문제은행을 불러오지 못했습니다.");

    const singles = bank.single_items || [];
    const sets = bank.set_items || [];

    const selectedSingles = selectRandomSingleSlotsFromBank(singles);
    const selectedSets = state.examType === "level-test"
      ? selectRandomLevelTestSetsFromBank(sets)
      : selectRandomFullSetsFromBank(sets);

    const randomItems = [];
    let display = 1;

    selectedSingles.forEach((item) => {
      item.original_question_number = item.original_question_number || item.question_number;
      item.question_number = display;
      item.id = `RANDOM_BANK_L${String(display).padStart(3, "0")}_SRC_${String(item.source_round || "")}_${String(item.original_question_number).padStart(3, "0")}`;
      randomItems.push(item);
      display += 1;
    });

    selectedSets.forEach((entry) => {
      const originalNumbers = getBankSetTargetSlots(entry);
      const setStart = display;
      const setEnd = display + 1;
      entry.set_id = `RANDOM_BANK_SET_${String(setStart).padStart(3, "0")}_${String(setEnd).padStart(3, "0")}_SRC_${String(entry.source_round || "")}_${originalNumbers.join("_")}`;
      entry.target_slots = [setStart, setEnd];
      entry.original_target_slots = originalNumbers;
      entry.audio_group_numbers = [setStart, setEnd];
      entry.instruction = `[${setStart}~${setEnd}] 다음을 듣고 물음에 답하십시오. (각 2점)`;
      entry.items = (entry.items || []).map((item, idx) => {
        item.original_question_number = item.original_question_number || item.question_number;
        item.question_number = display + idx;
        item.id = `RANDOM_BANK_L${String(display + idx).padStart(3, "0")}_SRC_${String(item.source_round || entry.source_round || "")}_${String(item.original_question_number).padStart(3, "0")}`;
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
      random_generation_rule: state.examType === "level-test"
        ? "1~20번은 원번호 슬롯별 선택, 21~30번은 대표 세트 유형 고정 선택"
        : "1~20번은 원번호 슬롯별 선택, 21~50번은 원번호 세트 슬롯별 선택",
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

      syncQuestionPracticeStateFromDom();

      let exam;
      state.isQuestionPracticeMode = false;
      const wantsQuestionPractice = isQuestionPracticeUiSelected();

      console.info("[question-practice] start check", {
        examType: state.examType,
        generationMode: state.generationMode,
        enabled: state.questionPractice.enabled,
        range: state.questionPractice.range,
        questionNumbers: state.questionPractice.questionNumbers,
        sourceExamIds: state.questionPractice.sourceExamIds,
        selectedEntries: getQuestionPracticeSelectedEntries().map((entry) => entry.exam_id)
      });

      if (shouldUseQuestionPracticeSelection()) {
        exam = await buildQuestionPracticeExamAndAnswerKey();
        state.isQuestionPracticeMode = true;
      } else if (wantsQuestionPractice) {
        throw new Error("문항 선택 연습이 선택되었지만 시험에 적용할 수 없습니다. 50문항 실전시험 · 회차별 시험지 상태에서 연습 회차와 유형을 다시 선택하세요.");
      } else if (state.generationMode === "random") {
        exam = generateRandomExamFromBank();
      } else {
        if (!state.selectedExamEntry) throw new Error("시험지를 선택하세요.");
        exam = await fetchJson(state.selectedExamEntry.test_file);
        exam.generated_exam_mode = "fixed";
        const publicExamLabel = getExamLabel(state.selectedExamEntry);
        if (publicExamLabel) {
          exam.public_exam_label = publicExamLabel;
          exam.generated_exam_label = publicExamLabel;
          exam.test_scope = publicExamLabel;
        }
        exam.title = APP_PUBLIC_TITLE;
      }

      state.currentExam = exam;
      state.screens = makeScreens(exam);

      if (state.isQuestionPracticeMode) {
        console.info("[question-practice] applied", {
          totalQuestions: getTotalQuestions(exam),
          totalScreens: state.screens.length,
          generatedExamLabel: exam.generated_exam_label,
          selection: exam.question_practice_selection
        });
      }

      state.totalSeconds = getDefaultTimeLimitMinutes(exam) * 60;
      state.examStartMs = Date.now();

      $("loginTopBar").style.display = "none";
      $("loginScreen").style.display = "none";
      $("examScreen").style.display = "block";

      startRemainTimer();
      renderCurrentScreen();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("[startExam]", error);
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
            <button class="diagnosis-btn" type="button" onclick="window.open('../listening-diagnosis/index.html?auto=1&v=topik93_step14_wrong_review_decrement_fix', '_blank')">진단 보고서 보기</button>
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
            <button class="diagnosis-btn" type="button" onclick="window.open('../listening-diagnosis/index.html?auto=1&v=topik93_step14_wrong_review_decrement_fix', '_blank')">진단 보고서로 돌아가기</button>
            <button class="back-btn" type="button" onclick="location.href='./index.html?v=topik93_step14_wrong_review_decrement_fix'">처음 화면으로 돌아가기</button>
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

    if (state.currentExam.generated_exam_mode === "question-practice") {
      result.exam_type = "question-practice";
      result.generated_exam_mode = "question-practice";
      result.generated_exam_label = state.currentExam.generated_exam_label || "문항 선택 연습";
      result.test_scope = state.currentExam.test_scope || result.test_scope || "문항 선택 연습";
      result.question_practice_selection = state.currentExam.question_practice_selection || null;
    }

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
      window.location.href = "../listening-diagnosis/index.html?auto=1&v=topik93_step14_wrong_review_decrement_fix";
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
    // 브라우저가 예전 v=topik93_step14_wrong_review_decrement_fix 캐시 화면을 다시 보여 주지 않도록 매번 새 버전값을 붙인다.
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
      const pauseEnabled = canUseQuestionPracticePause();
      if (state.questionPracticePause && state.questionPracticePause.paused) {
        status.textContent = "다시 재생";
        status.classList.remove("playing");
      } else if (playing) {
        status.textContent = pauseEnabled ? "일시정지" : "재생 중";
        status.classList.add("playing");
      } else if (audio.ended) {
        status.textContent = "듣기 완료";
        status.classList.remove("playing");
      } else if (state.screenTiming && $("waitBox").classList.contains("active")) {
        status.textContent = "대기";
        status.classList.remove("playing");
      } else {
        status.textContent = pauseEnabled ? "재생 준비" : "자동 재생";
        status.classList.remove("playing");
      }
    }

    if (playing) setPhaseActive("listen");
    updateQuestionPracticePauseControl();
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

    const status = $("audioStatusLabel");
    if (status) {
      status.addEventListener("click", handleQuestionPracticePauseButton);
      status.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          handleQuestionPracticePauseButton(event);
        }
      });
    }
  }

  function bindUI() {
    $("authBtn").addEventListener("click", handleAuth);

    const questionPracticeToggleBtn = $("questionPracticeToggleBtn");
    if (questionPracticeToggleBtn) {
      questionPracticeToggleBtn.addEventListener("click", toggleQuestionPracticePanel);
    }

    const questionPracticeClearBtn = $("questionPracticeClearBtn");
    if (questionPracticeClearBtn) {
      questionPracticeClearBtn.addEventListener("click", clearQuestionPracticeSelection);
    }

    document.querySelectorAll("[data-exam-type]").forEach((button) => {
      button.addEventListener("click", () => {
        state.examType = button.dataset.examType;
        state.roundListExpanded = false;
        setActiveButtons("[data-exam-type]", "examType", state.examType);
        renderRoundList();
        updateQuestionPracticeAvailability();
      });
    });

    document.querySelectorAll("[data-generation-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.generationMode = button.dataset.generationMode;
        state.roundListExpanded = false;
        setActiveButtons("[data-generation-mode]", "generationMode", state.generationMode);
        renderRoundList();
        updateQuestionPracticeAvailability();
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
