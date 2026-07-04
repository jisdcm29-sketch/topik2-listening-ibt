# TOPIK II Listening PBT-style IBT

TOPIK II PBT 듣기 문제를 화면 기반으로 구현한 PBT형 IBT 시뮬레이션입니다.

이 프로그램은 공식 TOPIK II IBT 복제 프로그램이 아닙니다.  
TOPIK II PBT 듣기 1~50번 문제를 컴퓨터 화면에서 풀 수 있도록 구성한 학습용 시뮬레이션입니다.

## 실행 주소

### 학생용 시작 주소

```text
https://jisdcm29-sketch.github.io/topik2-listening-ibt/
```

### 시험 화면 직접 주소

```text
https://jisdcm29-sketch.github.io/topik2-listening-ibt/listening-test/index.html
```

## 현재 포함 기능

- TOPIK II 듣기 102회, 103회
- 50문항 실전시험
- 회차별 시험지
- 문항은행 기반 랜덤 시험
- 듣기 오디오 자동 재생
- 21~50번 2문항 세트 표시
- 이미지 문항 표시
- 시험 종료 후 진단 보고서
- 오답 다시 풀기
- 교사용 문제지 출력

## 진단 보고서 주의

진단 보고서 주소를 직접 열면 브라우저 localStorage에 남아 있는 예전 결과가 표시될 수 있습니다.

따라서 실제 사용 순서는 다음과 같습니다.

```text
1. 학생용 시작 주소 접속
2. 시험 선택
3. 시험 시작
4. 답안 제출
5. 자동으로 진단 보고서 이동
```

진단 보고서 직접 주소는 테스트용입니다.

```text
https://jisdcm29-sketch.github.io/topik2-listening-ibt/listening-diagnosis/index.html
```

이 주소를 직접 열 때 예전 TOPIK I 문구가 보이면, 이전 브라우저 저장 결과가 남아 있는 것입니다. 실제 TOPIK II 듣기 시험을 새로 시행하고 제출하면 TOPIK II 듣기 진단 보고서가 정상 표시됩니다.

## 업로드 구조

GitHub Pages에서는 아래 상대 경로를 반드시 유지해야 합니다.

```text
listening-test/
listening-test/data/
listening-test/data/exams/
listening-test/data/answer-keys/
listening-test/audio/102/
listening-test/audio/103/
listening-test/images/102/
listening-test/images/103/
listening-diagnosis/
index.html
README.md
.nojekyll
```

## 로컬 실행

```powershell
cd C:\topik2-listening-ibt
python -m http.server 5500
```

브라우저:

```text
http://localhost:5500/listening-test/index.html
```

## 캐시 확인

GitHub Pages 반영 후 화면이 이상하면 주소 뒤에 버전을 붙이고 Ctrl+F5로 새로고침합니다.

```text
https://jisdcm29-sketch.github.io/topik2-listening-ibt/listening-test/index.html?v=check01
```
