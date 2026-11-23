/*
 * 국가법령정보센터 Open API에서 수록 법령(법률·시행령·시행규칙) 현행 본문을 받아
 * 하나의 JSON 파일(laws-raw-YYYYMMDD.json)로 내려받는 스크립트.
 *
 * 실행 방법: Open API에 IP가 등록된 컴퓨터의 브라우저에서
 *   https://www.law.go.kr/DRF/lawSearch.do?OC=<OC>&target=law&type=XML&query=민법
 * 페이지를 연 뒤, 이 파일 내용을 실행하고 lawFetch("<OC>")를 호출한다.
 * (같은 사이트 안에서 실행해야 브라우저가 요청을 막지 않는다.)
 * 진행 상황은 window.__LF 에 기록된다. OC 값은 결과 파일에 남기지 않는다.
 */
const LAW_NAMES = [
  "근로기준법", "최저임금법", "임금채권보장법", "근로자퇴직급여 보장법",
  "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", "기간제 및 단시간근로자 보호 등에 관한 법률",
  "파견근로자 보호 등에 관한 법률", "직업안정법", "노동조합 및 노동관계조정법",
  "공무원의 노동조합 설립 및 운영 등에 관한 법률", "교원의 노동조합 설립 및 운영 등에 관한 법률",
  "근로자참여 및 협력증진에 관한 법률", "노동위원회법", "산업안전보건법", "중대재해 처벌 등에 관한 법률",
  "산업재해보상보험법", "고용보험법", "고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률",
  "외국인근로자의 고용 등에 관한 법률", "근로복지기본법", "채용절차의 공정화에 관한 법률", "민법"
];
const KINDS = ["", " 시행령", " 시행규칙"];
const norm = s => String(s).replace(/\s+/g, "").replace(/[·ㆍ・‧∙]/g, "·");
const asList = x => (x == null ? [] : Array.isArray(x) ? x : [x]);

async function lawFetch(OC) {
  const S = (window.__LF = { done: false, step: "검색", log: [], missing: [], items: [], error: null });
  const get = async (path, params) => {
    const u = path + "?" + new URLSearchParams({ OC, type: "JSON", ...params });
    for (let i = 0; i < 3; i++) {
      try {
        const t = await (await fetch(u)).text();
        return JSON.parse(t);
      } catch (e) { if (i === 2) throw new Error(path + " 실패: " + e.message); await new Promise(r => setTimeout(r, 1500)); }
    }
  };
  try {
    for (const base of LAW_NAMES) {
      const res = await get("/DRF/lawSearch.do", { target: "law", query: base, display: "100" });
      const rows = asList(res?.LawSearch?.law);
      if (!res?.LawSearch) throw new Error("검색 응답이 이상합니다: " + JSON.stringify(res).slice(0, 300));
      KINDS.forEach((suffix, k) => {
        if (base === "민법" && k > 0) return;
        const want = norm(base + suffix);
        const hit = rows.find(r => norm(r["법령명한글"]) === want && r["현행연혁코드"] === "현행");
        if (hit) S.items.push({ group: base, kind: ["법률", "시행령", "시행규칙"][k], search: hit });
        else S.missing.push(base + suffix);
      });
      S.log.push("검색 " + base);
    }
    S.step = "본문";
    let n = 0;
    for (const it of S.items) {
      const j = await get("/DRF/lawService.do", { target: "law", MST: it.search["법령일련번호"] });
      if (!j?.["법령"]) throw new Error(it.search["법령명한글"] + " 본문 응답이 이상합니다: " + JSON.stringify(j).slice(0, 300));
      it.body = j["법령"];
      S.log.push("본문 " + it.search["법령명한글"] + " (" + ++n + "/" + S.items.length + ")");
    }
    // 결과 파일에 OC가 남지 않도록 링크 속 OC 값을 지운다
    const out = JSON.stringify({ fetchedAt: new Date().toISOString(), source: "국가법령정보센터 Open API (law.go.kr)", missing: S.missing, items: S.items })
      .split("OC=" + OC).join("OC=");
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([out], { type: "application/json" }));
    a.download = "laws-raw-" + stamp + ".json";
    document.body.appendChild(a); a.click();
    S.size = out.length; S.file = a.download;
  } catch (e) { S.error = e.message; }
  S.done = true;
  return S;
}
