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

    const result = {
      test_level: "TOPIK II",
      section: "listening",
      test_name: exam.title || exam.exam_id || "TOPIK II Listening",
      test_scope: exam.test_scope || exam.exam_type || "full",
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
      generated_exam_round: exam.source_round || "",
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