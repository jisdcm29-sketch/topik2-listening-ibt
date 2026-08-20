# TOPIK II 듣기 진단 보고서 step03 수정 패키지

## 수정 파일
- listening-diagnosis/index.html

## 수정 내용
- 진단 보고서 상단 toolbar에 `다른 회차·유형 풀기` 버튼 추가
- 버튼 클릭 시 `../listening-test/index.html?v=question_practice_step03_from_diagnosis`를 새 탭으로 열어 인증화면에서 다른 회차/유형을 선택할 수 있게 함
- 기존 `PDF로 인쇄 / 저장`, `오답 다시 풀기` 기능은 유지
- localStorage/sessionStorage의 기존 결과와 오답 다시 풀기 진행 상태는 삭제하거나 덮어쓰지 않음

## 적용 위치
C:\topik2-listening-ibt 에 압축을 풀어 덮어쓰기

## 확인 주소
http://localhost:5500/listening-diagnosis/index.html?v=diagnosis_return_button_step03
