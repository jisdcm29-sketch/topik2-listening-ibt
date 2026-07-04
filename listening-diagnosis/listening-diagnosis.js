(function () {
  "use strict";

  const reportEl = document.getElementById("report");
  const loadPanel = document.getElementById("loadPanel");

  const AREA_LABELS = {
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

  const REVIEW_TIPS = {
    visual_graph_choice: "그림의 인물, 장소, 물건, 행동을 먼저 확인한 뒤 음성에서 같은 단서를 찾으세요.",
    following_response: "마지막 말의 의도와 높임 표현을 확인하고 자연스럽게 이어질 말을 고르세요.",
    next_action: "대화가 끝난 직후 여자가 가장 먼저 할 행동을 동사 중심으로 잡으세요.",
    same_content_single: "날짜, 장소, 수량, 이유처럼 바뀌기 쉬운 세부 정보를 표시하며 들으세요.",
    main_thought_single: "남자가 반복하거나 강조하는 표현을 중심 생각의 근거로 확인하세요.",
    main_thought_set: "세트의 첫 문항은 전체 주장, 두 번째 문항은 세부 내용 근거로 나누어 들으세요.",
    speaker_action_intention: "화자가 무엇을 하고 있는지, 왜 말하는지 목적 표현을 먼저 찾으세요.",
    speaker_identity: "직업, 역할, 담당 업무를 알려 주는 단서를 연결하세요.",
    topic_content: "담화의 첫머리와 반복되는 핵심 명사를 중심으로 주제를 잡으세요.",
    attitude_method: "화자의 평가 표현, 우려·비판·강조 표현, 설명 방식을 구분하세요.",
    same_content_set: "세트 오디오를 들으며 각 선택지의 핵심 단어를 듣기 전후로 대조하세요."
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

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("ko-KR");
  }

  function getAreaLabel(item) {
    return AREA_LABELS[item.diagnostic_area] || item.category || item.diagnostic_area || "기타";
  }

  function groupStats(result) {
    const map = new Map();
    (result.items || []).forEach((item) => {
      const key = item.diagnostic_area || item.category || "기타";
      if (!map.has(key)) {
        map.set(key, { key, label: getAreaLabel(item), total: 0, correct: 0, points: 0, earned: 0, wrongNumbers: [] });
      }
      const row = map.get(key);
      const points = Number(item.points || 0);
      row.total += 1;
      row.points += points;
      row.earned += Number(item.earned_points || 0);
      if (item.is_correct) row.correct += 1;
      else row.wrongNumbers.push(item.question_number);
    });
    return Array.from(map.values()).map((row) => ({
      ...row,
      rate: row.points > 0 ? Math.round((row.earned / row.points) * 100) : 0
    })).sort((a, b) => a.rate - b.rate || b.total - a.total);
  }

  function getScoreBand(score) {
    const value = Number(score || 0);
    if (value >= 85) return { title: "TOPIK II 듣기 고급 안정권", range: "85~100점", level: "고급 담화 이해 안정 단계", stable: "TOPIK II 듣기 고득점권 유지 단계", next: "전문 담화의 세부 논리와 말하는 방식 정교화", prescription: "긴 담화의 구조, 화자의 태도, 말하는 방식을 근거와 함께 설명하는 연습을 유지하세요." };
    if (value >= 70) return { title: "TOPIK II 듣기 고급 진입 가능", range: "70~84점", level: "고급 담화 이해 진입 단계", stable: "후반부 세트 문항 안정화 필요", next: "85점 이상, 전문 담화 세부 추론 강화", prescription: "21~50번 세트 문항에서 중심 생각과 내용 일치 근거를 동시에 잡는 연습이 필요합니다." };
    if (value >= 50) return { title: "TOPIK II 듣기 중급 안정화 필요", range: "50~69점", level: "중급 담화 이해 보완 단계", stable: "전반부는 가능하나 후반부 긴 담화 보완 필요", next: "70점 이상, 후반부 세트 문항 정답률 향상", prescription: "13~20번 단일 담화와 21~30번 세트 문항을 묶어 다시 듣고 핵심 근거를 표시하세요." };
    if (value >= 30) return { title: "TOPIK II 듣기 중급 진입 준비", range: "30~49점", level: "기본 담화 이해는 가능하나 유형별 보완 필요", stable: "TOPIK II 안정권 진입 전 준비 단계", next: "50점 이상, 전반부 단일 문항 안정화", prescription: "4~20번의 짧은 대화, 행동 추론, 내용 일치 문항부터 다시 안정화해야 합니다." };
    return { title: "TOPIK II 듣기 기초 보완 필요", range: "0~29점", level: "기초 듣기 표현과 핵심 단서 보완 단계", stable: "TOPIK II 안정권 진입 전 기초 단계", next: "30점 이상, 짧은 대화와 기본 정보 파악 안정화", prescription: "짧은 질문과 응답, 인물의 행동, 장소·상황 단서를 먼저 잡는 연습이 필요합니다." };
  }

  function answerText(item, num) {
    if (!num) return "미응답";
    const found = (item.options || []).find((opt) => String(opt.number) === String(num));
    if (found) return `${num}. ${found.text || "(이미지 선택지)"}`;
    return String(num);
  }

  function renderBarRows(stats) {
    return stats.map((row) => `
      <div class="bar-row">
        <div class="bar-head"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(row.rate)}%</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, row.rate))}%"></div></div>
        <div class="bar-foot">점수 ${escapeHtml(row.earned)} / ${escapeHtml(row.points)} · 정답 ${escapeHtml(row.correct)} / ${escapeHtml(row.total)}문항</div>
      </div>
    `).join("");
  }

  function renderPriority(stats) {
    const weak = stats.filter((row) => row.wrongNumbers.length > 0).slice(0, 3);
    if (!weak.length) return "<p>현재 우선 복습이 필요한 약점 유형이 뚜렷하지 않습니다.</p>";
    return weak.map((row, index) => `
      <h3>${index + 1}순위 · ${escapeHtml(row.label)}</h3>
      <p>현재 결과: ${escapeHtml(row.correct)} / ${escapeHtml(row.total)}문항 정답, ${escapeHtml(row.earned)} / ${escapeHtml(row.points)}점, 정답률 ${escapeHtml(row.rate)}%</p>
      <p>복습할 문항: ${escapeHtml(row.wrongNumbers.join(", ") || "-")}번</p>
      <p>복습 방법: ${escapeHtml(REVIEW_TIPS[row.key] || "오답 문항의 선택지와 정답 근거를 다시 확인하세요.")}</p>
    `).join("");
  }

  function renderCoreTable(stats) {
    return `
      <table>
        <thead><tr><th>유형</th><th>정답 수</th><th>점수</th><th>정답률</th><th>복습할 문항</th></tr></thead>
        <tbody>
          ${stats.map((row) => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td>${escapeHtml(row.correct)} / ${escapeHtml(row.total)}</td>
              <td>${escapeHtml(row.earned)} / ${escapeHtml(row.points)}</td>
              <td>${escapeHtml(row.rate)}%</td>
              <td>${row.wrongNumbers.length ? `${escapeHtml(row.wrongNumbers.join(", "))}번` : "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderWrongCards(result) {
    const wrongItems = (result.items || []).filter((item) => !item.is_correct && item.student_answer);
    const unanswered = (result.items || []).filter((item) => !item.student_answer);
    const wrongHtml = wrongItems.length ? wrongItems.map((item) => `
      <div class="wrong-card">
        <strong>${escapeHtml(item.question_number)}번</strong>
        <span style="float:right">${escapeHtml(getAreaLabel(item))}</span><br>
        출처: ${escapeHtml(item.source_round || result.generated_exam_round || "-")}회 원문항 ${escapeHtml(item.original_question_number || item.question_number)}번<br>
        <span class="bad">내 답 ${escapeHtml(answerText(item, item.student_answer))}</span><br>
        <span class="good">정답 ${escapeHtml(answerText(item, item.correct_answer))}</span>
      </div>
    `).join("") : "<p>오답 문항이 없습니다.</p>";
    const unansweredHtml = unanswered.length ? `<p>${escapeHtml(unanswered.map((item) => item.question_number).join(", "))}번</p>` : "<p>미응답 문항이 없습니다.</p>";
    return `<h2>오답 문항</h2><div class="wrong-grid">${wrongHtml}</div><h2>미응답 문항</h2>${unansweredHtml}`;
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

  function collectRoundsFromResult(result) {
    const rounds = [];

    splitRoundTokens(result?.bank_rounds).forEach((round) => rounds.push(round));
    splitRoundTokens(result?.generated_exam_round).forEach((round) => rounds.push(round));
    splitRoundTokens(result?.source_round).forEach((round) => rounds.push(round));

    (result?.items || []).forEach((item) => {
      splitRoundTokens(item?.source_round).forEach((round) => rounds.push(round));
    });

    return sortRoundTokens(rounds);
  }

  function isRandomBankResult(result) {
    return (
      result?.generated_exam_mode === "random" ||
      String(result?.test_name || "").includes("문제은행 랜덤") ||
      String(result?.test_scope || "").includes("문제은행 기반 랜덤")
    );
  }

  function normalizeRandomBankResult(result) {
    if (!isRandomBankResult(result)) return result;

    const rounds = collectRoundsFromResult(result);
    if (!rounds.length) return result;

    const normalized = { ...result };
    normalized.generated_exam_round = rounds.join(",");

    const questionLabel = String(normalized.test_name || "").includes("레벨테스트") ||
      String(normalized.test_scope || "").includes("레벨테스트")
      ? "레벨테스트"
      : `${normalized.total_questions || (normalized.items || []).length}문항`;

    normalized.test_scope = `${rounds.join("·")}회 문제은행 기반 랜덤 ${questionLabel}`;
    return normalized;
  }

  function render(result) {
    if (!result || !Array.isArray(result.items)) {
      reportEl.innerHTML = '<div class="empty">올바른 TOPIK II 듣기 result.json 형식이 아닙니다.</div>';
      loadPanel.style.display = "block";
      return;
    }

    result = normalizeRandomBankResult(result);

    const score = Number(result.section_score_100 ?? result.earned_points ?? 0);
    const band = getScoreBand(score);
    const stats = groupStats(result);
    const weak = stats.filter((row) => row.wrongNumbers.length > 0);
    const topWeak = weak.slice(0, 3);
    const strong = stats.filter((row) => row.rate >= 70);
    const wrongNumbers = (result.items || []).filter((item) => !item.is_correct).map((item) => item.question_number);
    const modeLabel = result.generated_exam_mode === "random" ? "랜덤 시험지" : (result.generated_exam_label || result.test_name || "회차별 시험지");

    reportEl.innerHTML = `
      <div class="report-title">TOPIK II 듣기 진단 보고서</div>
      <div class="sub-title">${escapeHtml(result.test_name || "TOPIK II 듣기")} · ${escapeHtml(result.total_questions)}문항</div>
      <div class="rule"></div>

      <div class="summary-grid">
        <div class="summary-box"><span>응시자</span><strong>${escapeHtml(result.student_name || "-")}</strong></div>
        <div class="summary-box"><span>전화번호</span><strong>${escapeHtml(result.student_phone || "-")}</strong></div>
        <div class="summary-box"><span>듣기 점수</span><strong>${escapeHtml(result.earned_points)}점</strong></div>
        <div class="summary-box"><span>정답 수</span><strong>${escapeHtml(result.correct_count)} / ${escapeHtml(result.total_questions)}</strong></div>
        <div class="summary-box"><span>미응답</span><strong>${escapeHtml(result.unanswered_count)}</strong></div>
      </div>

      <section class="level-box">
        <h2>${escapeHtml(band.title)}</h2>
        <p>듣기 점수 구간: ${escapeHtml(band.range)}</p>
        <p>예상 수준: ${escapeHtml(band.level)}</p>
        <p>안정권 해석: ${escapeHtml(band.stable)}</p>
        <p>다음 목표: ${escapeHtml(band.next)}</p>
        <p>${escapeHtml(band.prescription)}</p>
      </section>

      <section class="notice">
        <h3>공식 급수 안내</h3>
        <p>이 보고서는 TOPIK II 듣기 영역만 기준으로 한 예상 수준입니다. 공식 TOPIK 급수는 전체 시험 기준에 따라 결정되므로, 이 결과만으로 공식 급수를 확정할 수 없습니다.</p>
      </section>

      <h2>시험 정보</h2>
      <table>
        <tbody>
          <tr><th>시험명</th><td>${escapeHtml(result.test_name || "-")}</td></tr>
          <tr><th>응시자</th><td>${escapeHtml(result.student_name || "-")}</td></tr>
          <tr><th>전화번호</th><td>${escapeHtml(result.student_phone || "-")}</td></tr>
          <tr><th>시험 범위</th><td>${escapeHtml(result.test_scope || "-")}</td></tr>
          <tr><th>출제 방식</th><td>${escapeHtml(modeLabel)}</td></tr>
          <tr><th>출제 회차</th><td>${escapeHtml(result.generated_exam_round || "-")}</td></tr>
          <tr><th>응시 시간</th><td>${escapeHtml(formatDateTime(result.started_at))} ~ ${escapeHtml(formatDateTime(result.submitted_at))}</td></tr>
          <tr><th>문항 수</th><td>${escapeHtml(result.total_questions)}문항</td></tr>
        </tbody>
      </table>

      <h2>유형별 득점 그래프</h2>
      <p>아래 그래프는 TOPIK II 듣기 대표 유형으로 묶어 계산한 득점률입니다. 막대가 짧은 유형일수록 우선 복습이 필요한 영역입니다.</p>
      ${renderBarRows(stats)}

      <h2>유형별 약점 요약</h2>
      <p>현재 가장 보완이 필요한 유형은 ${topWeak.length ? topWeak.map((row) => `${escapeHtml(row.label)} ${escapeHtml(row.rate)}%`).join(", ") : "뚜렷하지 않습니다"}입니다.</p>
      <p>관련 오답 문항: ${topWeak.length ? topWeak.map((row) => `${escapeHtml(row.label)}: ${escapeHtml(row.wrongNumbers.join(", "))}번`).join(" / ") : "-"}</p>

      <h2>우선 복습 순서</h2>
      <p>오답이 많은 경우 모든 문항을 한 번에 다시 풀기보다, 아래 순서대로 유형을 묶어서 복습하는 것이 효과적입니다.</p>
      ${renderPriority(stats)}

      <section class="blue-panel">
        <h3>오늘 할 일</h3>
        <ol>
          <li>1순위 유형의 오답 오디오를 다시 듣고, 정답이 되는 표현을 한 줄로 적습니다.</li>
          <li>후반부 세트 문항은 두 문항의 정답 근거를 각각 표시합니다.</li>
          <li>긴 담화는 들으면서 인물, 이유, 태도, 핵심 주장을 표로 정리합니다.</li>
        </ol>
        <h3>다음 랜덤 시험 전 확인할 것</h3>
        <p>같은 유형의 오답 수가 줄었는지, 미응답이 생기지 않았는지, 정답 근거를 듣고 설명할 수 있는지 확인하세요.</p>
      </section>

      <h2>핵심 구간 요약</h2>
      <p>구간별 정답률과 복습할 문항을 빠르게 확인하도록 요약했습니다.</p>
      ${renderCoreTable(stats)}

      <h2>강점·약점 영역</h2>
      <h3>강점 영역</h3>
      <div class="pill-wrap">${strong.length ? strong.map((row) => `<span class="pill" style="background:#e8fff1;color:#0e6b33">${escapeHtml(row.label)} ${escapeHtml(row.rate)}%</span>`).join("") : '<span class="pill">아직 뚜렷한 강점 영역이 없습니다.</span>'}</div>
      <h3>약점 영역</h3>
      <div class="pill-wrap">${weak.length ? weak.map((row) => `<span class="pill">${escapeHtml(row.label)} 문제 ${escapeHtml(row.wrongNumbers.length)}개</span>`).join("") : '<span class="pill" style="background:#e8fff1;color:#0e6b33">약점 영역이 뚜렷하지 않습니다.</span>'}</div>

      <h2>학습 처방</h2>
      <p>현재 듣기 기준 예상 수준은 '${escapeHtml(band.title)}'입니다. 다음 목표는 ${escapeHtml(band.next)}입니다.</p>
      <p><strong>우선 복습 유형</strong><br>${topWeak.length ? topWeak.map((row) => escapeHtml(row.label)).join(", ") : "-"}</p>
      <p><strong>오답·미응답 관리</strong><br>${wrongNumbers.length ? `${escapeHtml(wrongNumbers.join(", "))}번 문항을 오답 다시 풀기로 먼저 복습하세요.` : "현재 오답·미응답 문항이 없습니다."}</p>
      <p><strong>2주 계획</strong><br>1~3일차 오답 근거 표시 → 4~6일차 약점 유형 복습 → 7일차 전체 재풀이 → 8~13일차 새 랜덤 시험 반복 → 14일차 보고서 비교.</p>

      ${renderWrongCards(result)}
    `;
  }

  function loadFromLocal() {
    const raw = localStorage.getItem("topik2_listening_last_result");
    if (!raw) {
      reportEl.innerHTML = '<div class="empty">브라우저에 저장된 TOPIK II 듣기 결과가 없습니다. 시험 제출 후 다시 열어 주세요.</div>';
      loadPanel.style.display = "block";
      return;
    }
    try {
      render(JSON.parse(raw));
      loadPanel.style.display = "none";
    } catch (error) {
      reportEl.innerHTML = `<div class="empty">결과 파일을 읽는 중 오류가 발생했습니다.<br>${escapeHtml(error.message)}</div>`;
      loadPanel.style.display = "block";
    }
  }

  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("wrongBtn").addEventListener("click", () => {
    alert("오답 다시 풀기는 다음 단계에서 listening-test의 오답 복습 모드와 연결합니다. 현재는 보고서의 오답 문항 목록을 기준으로 복습하세요.");
  });
  document.getElementById("loadLocalBtn").addEventListener("click", loadFromLocal);
  document.getElementById("fileInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    render(JSON.parse(text));
  });

  loadFromLocal();
})();