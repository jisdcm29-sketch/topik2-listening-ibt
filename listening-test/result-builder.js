(function () {
  "use strict";

  function normalizeQuestionItems(examItems) {
    const normalized = [];

    (examItems || []).forEach((entry) => {
      if (entry && Array.isArray(entry.items)) {
        entry.items.forEach((item) => {
          normalized.push({
            ...item,
            set_id: entry.set_id || item.set_id || "",
            audio_url: item.audio_url || entry.audio_url || "",
            source_round: item.source_round || entry.source_round || "",
            source_audio_file: item.source_audio_file || entry.source_audio_file || ""
          });
        });
      } else if (entry) {
        normalized.push(entry);
      }
    });

    return normalized;
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

  function collectResultRounds(exam, resultItems) {
    const rounds = [];

    splitRoundTokens(exam.bank_rounds).forEach((round) => rounds.push(round));
    splitRoundTokens(exam.generated_exam_round).forEach((round) => rounds.push(round));
    splitRoundTokens(exam.source_round).forEach((round) => rounds.push(round));

    (resultItems || []).forEach((item) => {
      splitRoundTokens(item.source_round).forEach((round) => rounds.push(round));
    });

    return sortRoundTokens(rounds);
  }

  function isRandomExam(exam) {
    return (
      exam.generated_exam_mode === "random" ||
      exam.exam_type === "random" ||
      String(exam.exam_id || "").includes("random-bank") ||
      String(exam.title || "").includes("문제은행 랜덤")
    );
  }

  function buildResultTestScope(exam, resultItems) {
    if (!isRandomExam(exam)) {
      return exam.test_scope || exam.exam_type || "full";
    }

    const rounds = collectResultRounds(exam, resultItems);
    const roundLabel = rounds.length ? `${rounds.join("·")}회 ` : "";
    const questionLabel = exam.exam_type === "level-test" ? "레벨테스트" : `${resultItems.length}문항`;
    return `${roundLabel}문제은행 기반 랜덤 ${questionLabel}`;
  }

  function buildResult(payload) {
    const exam = payload.exam || {};
    const items = normalizeQuestionItems(exam.items || []);
    const answers = payload.answers || {};

    let correctCount = 0;
    let earnedPoints = 0;
    let totalPossiblePoints = 0;

    const resultItems = items.map((item) => {
      const qn = String(item.question_number);
      const studentAnswer = answers[qn] || "";
      const correctAnswer = item.correct_answer || "";
      const points = Number(item.points || 0);
      const isCorrect = Boolean(studentAnswer && correctAnswer && String(studentAnswer) === String(correctAnswer));

      totalPossiblePoints += points;
      if (isCorrect) {
        correctCount += 1;
        earnedPoints += points;
      }

      return {
        id: item.id || "",
        question_number: item.question_number,
        original_question_number: item.original_question_number || item.question_number,
        source_round: item.source_round || exam.source_round || "",
        type: item.type || "",
        category: item.category || "",
        diagnostic_area: item.diagnostic_area || "",
        instruction: item.instruction || "",
        question: item.question || "",
        audio_url: item.audio_url || "",
        source_audio_file: item.source_audio_file || "",
        image_url: item.image_url || "",
        image_options: item.image_options || [],
        options: item.options || [],
        points: points,
        earned_points: isCorrect ? points : 0,
        correct_answer: correctAnswer,
        student_answer: studentAnswer,
        is_correct: isCorrect,
        review_source_original_key: item.review_source_original_key || "",
        review_source_question_number: item.review_source_question_number || null,
        review_source_student_answer: item.review_source_student_answer || "",
        review_source_is_correct: Boolean(item.review_source_is_correct),
        description: item.description || "",
        set_id: item.set_id || ""
      };
    });

    const answeredCount = resultItems.filter((item) => item.student_answer).length;
    const resultRounds = collectResultRounds(exam, resultItems);
    const generatedExamRound = resultRounds.join(",");

    const result = {
      test_level: "TOPIK II",
      section: "listening",
      test_name: exam.title || exam.exam_id || "TOPIK II Listening",
      test_scope: buildResultTestScope(exam, resultItems),
      student_name: payload.studentName || "",
      student_phone: payload.studentPhone || "",
      started_at: payload.startedAt || new Date().toISOString(),
      submitted_at: new Date().toISOString(),
      time_limit_minutes: exam.time_limit_minutes || null,
      total_questions: resultItems.length,
      answered_count: answeredCount,
      unanswered_count: resultItems.length - answeredCount,
      correct_count: correctCount,
      wrong_count: resultItems.length - correctCount,
      total_possible_points: totalPossiblePoints,
      earned_points: earnedPoints,
      section_score_100: totalPossiblePoints > 0 ? Math.round((earnedPoints / totalPossiblePoints) * 1000) / 10 : 0,
      generated_exam_mode: exam.generated_exam_mode || exam.exam_type || "fixed",
      generated_exam_round: generatedExamRound || exam.generated_exam_round || exam.source_round || "",
      generated_exam_label: exam.title || "",
      audio_mode: exam.audio_mode || "manual",
      items: resultItems
    };

    localStorage.setItem("topik2_listening_last_result", JSON.stringify(result, null, 2));
    return result;
  }

  window.TopikResultBuilder = {
    normalizeQuestionItems,
    buildResult
  };
})();