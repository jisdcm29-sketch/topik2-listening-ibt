// STEP65: TOPIK II 듣기 진단 보고서 문구 보정
// 목적: 이전 TOPIK I Reading 결과 문자열이 진단 보고서에 남아 보이는 경우 화면 표시를 TOPIK II 듣기로 보정합니다.
(function () {
  "use strict";

  const REPLACEMENTS = [
    ["TOPIK I Reading IBT Simulation", "TOPIK II Listening PBT-style IBT"],
    ["TOPIK I Reading Simulation", "TOPIK II Listening PBT-style IBT"],
    ["TOPIK I Reading", "TOPIK II Listening"],
    ["Reading IBT Simulation", "Listening PBT-style IBT"],
    ["Reading Simulation", "Listening PBT-style IBT"]
  ];

  function fixText(value) {
    let out = String(value ?? "");
    REPLACEMENTS.forEach(([from, to]) => {
      out = out.split(from).join(to);
    });
    return out;
  }

  function walkAndFix(root) {
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      const next = fixText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });

    if (document.title) {
      document.title = fixText(document.title);
    }
  }

  function runFix() {
    walkAndFix(document.body);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runFix);
  } else {
    runFix();
  }

  const observer = new MutationObserver(() => runFix());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
