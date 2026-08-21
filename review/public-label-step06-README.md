# TOPIK II Listening public labels step06

수정 목적:
- 인증화면의 타이틀을 `Юү багшийн TOPIK 2 сонсох шалгалт`로 변경
- 학생에게 보이는 회차명을 89회, 90회 대신 실전A, 실전B ... 형식으로 표시
- 실제 시험 JSON, 정답표, 오디오, 이미지 경로는 그대로 유지
- 문항 선택 연습의 작은 출처 표시도 실전A 4번 문항 형식으로 표시
- 진단 보고서와 교사용 출력 화면도 가능한 범위에서 공개 표시명을 사용

회차 별칭:
{
  "89": "실전A",
  "90": "실전B",
  "91": "실전C",
  "93": "실전D",
  "94": "실전E",
  "96": "실전F",
  "97": "실전G",
  "99": "실전H",
  "100": "실전I",
  "102": "실전J",
  "103": "실전K"
}

수정 파일:
- listening-test/index.html
- listening-test/listening-test.js
- listening-test/data/exam-manifest.json
- listening-diagnosis/index.html
- listening-test/teacher-print.html

주의:
- 이 수정은 화면 표시명 정리용입니다.
- 원본 자료의 사용 권한, 저작권, 출처 관리 문제를 자동으로 해결하지 않습니다.
- 내부 데이터의 source_round, test_file, answer_key_file은 유지했습니다.
