# 노동법전 (labor-law-app)

공인노무사 업무용 노동법령 조회 웹앱입니다. PC 브라우저와 휴대폰 홈 화면(PWA)에서 사용합니다.

- 법령 출처: 국가법령정보센터(law.go.kr) Open API만 사용. 조문 글은 받은 그대로 옮기며 고치거나 덧붙이지 않습니다.
- 수록 법령: 노동 관계 법령 21개(시행령·시행규칙 포함)와 민법, 모두 63개 문서
  - 「근로자복지기본법」은 2010년에 「근로복지기본법」으로 이름이 바뀌어, 현재 이름으로 수록합니다.
  - 「중대재해 처벌 등에 관한 법률」은 시행규칙이 없어 법률·시행령만 있습니다.

## 폴더

- `app/`: 실제 앱(첫 화면 최근 개정 법령, 법령 화면, 조문 검색). `app/data/`에 법령 자료가 들어 있습니다.
- `tools/fetch-laws.js`: 국가법령정보센터에서 법령 원본을 받아 `laws-raw-날짜.json` 파일 하나로 내려받는 스크립트
- `tools/build-data.py`: 원본 파일을 앱이 읽는 자료(`app/data/`)로 바꾸는 스크립트
- `mockup/index.html`: 처음 만든 화면 시안(예시 글)

## 법령 자료 새로 받기

Open API는 등록된 IP(집 인터넷)에서만 응답하므로, 집 컴퓨터의 브라우저에서 받습니다.

1. 집 컴퓨터 브라우저에서 `https://www.law.go.kr/DRF/lawSearch.do?OC=<OC>&target=law&type=XML&query=민법` 을 엽니다.
2. 그 페이지에서 `tools/fetch-laws.js` 내용을 실행하고 `lawFetch("<OC>")` 를 부릅니다. 끝나면 `laws-raw-날짜.json` 이 내려받아집니다. (OC 값은 파일에 남지 않습니다.)
3. `python3 tools/build-data.py laws-raw-날짜.json` 으로 `app/data/` 를 새로 만듭니다.

OC 값(Open API 인증값)은 저장소에 올리지 않습니다.

## 앱 미리 보기

`app` 폴더에서 `python3 -m http.server` 를 실행하고 브라우저에서 `http://localhost:8000` 을 엽니다.
