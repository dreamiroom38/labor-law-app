/* 노동법전 앱
 * 데이터: data/index.json (법령 목록·최근 개정), data/laws/<법령ID>.json (조문)
 * 화면 주소: #home 첫 화면, #law-<법령ID>[-<조문키>] 법령 화면, #search 검색 결과(검색어는 화면이 기억)
 * 주소에는 영문·숫자·하이픈만 쓴다 (Claude 미리 보기 페이지에서도 동작하도록)
 */
"use strict";

const $ = s => document.querySelector(s);
const main = $("#main");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ymd = s => (s && s.length === 8 ? `${s.slice(0, 4)}. ${+s.slice(4, 6)}. ${+s.slice(6)}.` : "");
const today = (() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; })();
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let INDEX = null;
const DOCS = new Map(); // 법령ID -> 조문 데이터
const META = new Map(); // 법령ID -> 목록 정보

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " (" + r.status + ")");
  return r.json();
}
async function loadDoc(id) {
  if (!DOCS.has(id)) DOCS.set(id, await getJSON("data/laws/" + id + ".json"));
  return DOCS.get(id);
}
async function loadAll(onProgress) {
  const ids = [...META.keys()];
  let done = 0;
  await Promise.all(ids.map(async id => { await loadDoc(id); onProgress?.(++done, ids.length); }));
}

/* 짧은 이름: 화면 공간이 좁은 곳(필터)에서만 사용 */
const SHORT = {
  "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률": "남녀고용평등법",
  "기간제 및 단시간근로자 보호 등에 관한 법률": "기간제법",
  "파견근로자 보호 등에 관한 법률": "파견법",
  "노동조합 및 노동관계조정법": "노동조합법",
  "공무원의 노동조합 설립 및 운영 등에 관한 법률": "공무원노조법",
  "교원의 노동조합 설립 및 운영 등에 관한 법률": "교원노조법",
  "근로자참여 및 협력증진에 관한 법률": "근로자참여법",
  "중대재해 처벌 등에 관한 법률": "중대재해처벌법",
  "고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률": "보험료징수법",
  "외국인근로자의 고용 등에 관한 법률": "외국인고용법",
  "채용절차의 공정화에 관한 법률": "채용절차법",
  "근로자퇴직급여 보장법": "퇴직급여법",
};
const shortName = m => (SHORT[m.group] || m.group) + (m.kind === "법률" ? "" : " " + m.kind);

/* ───────── 첫 화면 ───────── */
let recentShown = 10;
function renderHome() {
  document.title = "노동법전";
  const rec = INDEX.recent.slice(0, recentShown).map(r => {
    const soon = r.enfDate > today ? `<span class="soon">시행 예정</span>` : "";
    return `<li><span class="kind">${esc(r.revType)}</span>
      <a class="name" href="#law-${r.id}">${esc(r.name)}</a>
      <span class="meta">공포 ${ymd(r.promDate)} · 시행 ${ymd(r.enfDate)}${soon}</span>
      ${r.summary ? `<p class="sum">${esc(r.summary)}</p>` : ""}</li>`;
  }).join("");
  const laws = INDEX.groups.map(g => {
    const first = g.docs[0];
    return first ? `<li><a href="#law-${first.id}">${esc(g.name)}</a></li>` : "";
  }).join("");
  main.innerHTML = `
  <section class="home">
    <div class="panel">
      <h2 class="sec">최근 개정 법령 <small>공포일 최신순</small></h2>
      <div class="recent"><ul>${rec}</ul></div>
      ${recentShown < INDEX.recent.length ? `<button class="more" id="moreRecent">더 보기</button>` : ""}
      <p class="note">자료 기준일 ${ymd(INDEX.fetchedAt.slice(0, 10).replace(/-/g, ""))} · 국가법령정보센터에서 받은 현행 법령의 마지막 개정입니다. 요약 문장은 국가법령정보센터의 제개정이유 첫 문단을 그대로 옮긴 것입니다.</p>
    </div>
    <div class="panel">
      <h2 class="sec">수록 법령 <small>${INDEX.groups.length}개 · 시행령·시행규칙 포함</small></h2>
      <ul class="laws">${laws}</ul>
    </div>
  </section>`;
  $("#moreRecent")?.addEventListener("click", () => { recentShown += 15; renderHome(); });
}

/* ───────── 법령 화면 ───────── */
// 조문 글 속 <개정 …>, [전문개정 …] 같은 표시는 흐리게
const fmtLine = t => esc(t).replace(/(&lt;[^&]*?(?:개정|신설|삭제|타법개정)[^&]*?&gt;|\[[^\]]*?(?:개정|신설|이동|본조)[^\]]*?\])/g, '<span class="rev">$1</span>');

function articleHTML(a, doc) {
  const tags = [];
  if (a.c) tags.push(`<span class="tag">이번 개정</span>`);
  if (a.e && a.e !== doc.enfDate) tags.push(`<span class="tag enf">${a.e > today ? "시행 예정 " : "시행 "}${ymd(a.e)}</span>`);
  const body = a.l.map(([lv, t]) => `<p class="l${lv}">${fmtLine(t)}</p>`).join("");
  return `<article class="jo" id="a-${a.k}">
    <h3>${esc(a.n)}${a.t ? "(" + esc(a.t) + ")" : ""} ${tags.join("")}</h3>
    ${body}${a.r ? `<p class="ref">${esc(a.r)}</p>` : ""}
  </article>`;
}

async function renderLaw(id, artKey) {
  const m = META.get(id);
  if (!m) return renderMissing();
  main.innerHTML = `<p class="status">${esc(m.name)} 불러오는 중…</p>`;
  const doc = await loadDoc(id);
  document.title = doc.name + " · 노동법전";
  const group = INDEX.groups.find(g => g.name === doc.group);
  const tabs = ["법률", "시행령", "시행규칙"].map(k => {
    const d = group.docs.find(x => x.kind === k);
    return d ? `<a role="tab" class="tabbtn" aria-selected="${d.id === id}" href="#law-${d.id}">${k}</a>` : "";
  }).join("");
  const toc = [], arts = [];
  for (const a of doc.articles) {
    if (a.h) { toc.push(`<div class="ch">${esc(a.h)}</div>`); arts.push(`<div class="chapter">${esc(a.h)}</div>`); continue; }
    toc.push(`<a href="#law-${id}-${a.k}" data-k="${a.k}"><span class="art-n">${esc(a.n)}</span> ${esc(a.t)}</a>`);
    arts.push(articleHTML(a, doc));
  }
  const reason = doc.reason.join("\n");
  main.innerHTML = `
  <section>
    <div class="lawhead">
      <div class="crumb"><a href="#home">수록 법령</a> › <span>${esc(doc.group)}</span></div>
      <h1>${esc(doc.name)}</h1>
      <div class="lawmeta">
        <span>[시행 ${ymd(doc.enfDate)}]</span>
        <span>[${esc(doc.lawKind)} 제${esc(doc.promNo)}호, ${ymd(doc.promDate)}, ${esc(doc.revType)}]</span>
        <span>${esc(doc.dept)}</span>
        <a href="https://www.law.go.kr/법령/${encodeURIComponent(doc.name)}" target="_blank" rel="noopener">국가법령정보센터에서 보기</a>
      </div>
      ${reason ? `<details class="why"><summary>이번 ${esc(doc.revType)} 이유 (국가법령정보센터 제개정이유)</summary><p>${esc(reason)}</p></details>` : ""}
    </div>
    <nav class="tabs" role="tablist" aria-label="법령 종류">${tabs}</nav>
    <div class="lawbody">
      <details class="toc" id="toc" ${matchMedia("(max-width: 860px)").matches ? "" : "open"}>
        <summary>조문 목차 <span aria-hidden="true">▾</span></summary>
        <div id="tocList">${toc.join("")}</div>
      </details>
      <div class="articles">${arts.join("")}</div>
    </div>
  </section>`;
  if (artKey) {
    const el = document.getElementById("a-" + artKey);
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.classList.add("flash");
      $(`#tocList a[data-k="${artKey}"]`)?.classList.add("on");
    }
  } else window.scrollTo(0, 0);
}

/* ───────── 검색 ───────── */
// "근로기준법 60조", "제43조의2" 처럼 조 번호가 있으면 해당 조문을 찾는다
function parseQuery(q) {
  const m = q.match(/제?\s*(\d+)\s*조(?:\s*의\s*(\d+))?/);
  const artNo = m ? "제" + m[1] + "조" + (m[2] ? "의" + m[2] : "") : null;
  const rest = (m ? q.replace(m[0], " ") : q).trim();
  const words = rest.split(/\s+/).filter(Boolean);
  return { artNo, words };
}
const normName = s => s.replace(/\s+/g, "").replace(/[·ㆍ]/g, "");

function lawsMatching(words) {
  // 검색어 묶음이 법령 이름(또는 줄임말)과 맞으면 그 법령으로 범위를 좁힌다
  const joined = normName(words.join(""));
  if (!joined) return null;
  const hit = [...META.values()].filter(m => {
    // 정확한 이름, 줄임말(예: 기간제법), 시행령·시행규칙을 뺀 이름(그 법령 3종 모두)
    const names = [m.name, shortName(m), m.group, SHORT[m.group] || m.group].map(normName);
    return names.includes(joined);
  });
  return hit.length ? hit : null;
}

const filterState = { doc: "all", expanded: new Set() };
async function renderSearch(q) {
  document.title = `‘${q}’ 검색 · 노동법전`;
  $("#q").value = q;
  if (!q.trim()) return renderHome();
  main.innerHTML = `<p class="status" id="ld">조문을 불러오는 중…</p>`;
  await loadAll((d, n) => { const el = $("#ld"); if (el) el.textContent = `조문을 불러오는 중… (${d}/${n})`; });

  const { artNo, words } = parseQuery(q);
  // 앞쪽 낱말이 법령 이름이면 그 법령 안에서만 찾는다 (예: "근로기준법 연차", "근로기준법 60조")
  let scope = null, terms = words, byName = null;
  for (let i = words.length; i >= 1; i--) {
    const m = lawsMatching(words.slice(0, i));
    if (m) { byName = m; terms = words.slice(i); break; }
  }
  if (byName && (artNo || terms.length)) scope = new Set(byName.map(m => m.id));
  else if (byName) terms = words; // 법령 이름만 친 경우: 바로가기 + 그 이름이 나오는 조문
  const lower = terms.map(t => t.toLowerCase());
  const groups = [];
  for (const [id, m] of META) {
    if (scope && !scope.has(id)) continue;
    const doc = DOCS.get(id);
    const hits = [];
    for (const a of doc.articles) {
      if (!a.n) continue;
      if (artNo && a.n !== artNo) continue;
      if (lower.length) {
        const text = (a.t + "\n" + a.l.map(x => x[1]).join("\n")).toLowerCase();
        if (!lower.every(t => text.includes(t))) continue;
      }
      if (!artNo && !lower.length) continue;
      hits.push(a);
    }
    if (hits.length) groups.push({ id, m, hits });
  }
  const total = groups.reduce((s, g) => s + g.hits.length, 0);
  if (!groups.some(g => g.id === filterState.doc)) filterState.doc = "all";
  const jump = byName && !scope ? `<div class="jump">${byName.map(m => `<a href="#law-${m.id}">${esc(m.name)} 바로가기 ›</a>`).join("")}</div>` : "";

  const filter = `<a data-doc="all" class="${filterState.doc === "all" ? "on" : ""}"><span>전체</span> <b>${total}</b></a>` +
    groups.map(g => `<a data-doc="${g.id}" class="${filterState.doc === g.id ? "on" : ""}" title="${esc(g.m.name)}"><span>${esc(shortName(g.m))}</span> <b>${g.hits.length}</b></a>`).join("");

  const LIMIT = 5;
  const shown = groups.filter(g => filterState.doc === "all" || g.id === filterState.doc);
  const body = shown.map(g => {
    const all = filterState.doc !== "all" || filterState.expanded.has(g.id);
    const list = all ? g.hits : g.hits.slice(0, LIMIT);
    return `<section class="group">
      <header><h2>${esc(g.m.name)}</h2><span>${g.hits.length}개 조문</span></header>
      ${list.map(a => `<a class="hit" href="#law-${g.id}-${a.k}">
          <div class="t">${esc(a.n)}${a.t ? "(" + markTerms(esc(a.t), lower) + ")" : ""}</div>
          <p class="s">${snippet(a, lower)}</p></a>`).join("")}
      ${!all && g.hits.length > LIMIT ? `<button class="showall" data-exp="${g.id}">${g.hits.length - LIMIT}개 더 보기</button>` : ""}
    </section>`;
  }).join("");

  main.innerHTML = `
  <section>
    <div class="reshead">
      <h1>검색어 <q>${esc(q)}</q></h1>
      <span>${groups.length}개 법령 · ${total}개 조문</span>
    </div>
    ${jump}
    ${total ? `<div class="results">
      <nav class="filter" aria-label="법령별 보기">${filter}</nav>
      <div class="groups">${body}</div>
    </div>` : `<div class="empty">찾는 조문이 없습니다. 띄어쓰기를 바꾸거나 더 짧은 낱말로 찾아보세요.</div>`}
  </section>`;
  main.querySelector(".filter")?.addEventListener("click", e => {
    const a = e.target.closest("a[data-doc]"); if (!a) return;
    filterState.doc = a.dataset.doc; renderSearch(q);
  });
  main.querySelectorAll("[data-exp]").forEach(b => b.addEventListener("click", () => { filterState.expanded.add(b.dataset.exp); renderSearch(q); }));
  window.scrollTo(0, 0);
}

function snippet(a, terms) {
  const lines = a.l.map(x => x[1]);
  let line = lines[0] || "", pos = -1;
  if (terms.length) {
    for (const l of lines) { const p = l.toLowerCase().indexOf(terms[0]); if (p >= 0) { line = l; pos = p; break; } }
  }
  let s = line, pre = "", post = "";
  if (s.length > 130) {
    const start = Math.max(0, pos - 50);
    s = s.slice(start, start + 130);
    pre = start > 0 ? "…" : ""; post = start + 130 < line.length ? "…" : "";
  }
  return pre + markTerms(esc(s), terms) + post;
}
function markTerms(html, terms) {
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    html = html.replace(re, m => `<mark>${m}</mark>`);
  }
  return html;
}

/* ───────── 주소에 따라 화면 바꾸기 ───────── */
function renderMissing() {
  main.innerHTML = `<div class="empty">찾는 화면이 없습니다. <a href="#home" style="color:var(--accent)">첫 화면으로</a></div>`;
}
let lastQuery = "";
try { lastQuery = sessionStorage.getItem("q") || ""; } catch (e) {}
async function route() {
  const h = location.hash.replace(/^#/, "");
  try {
    let m;
    if ((m = h.match(/^law-([0-9A-Za-z]+)(?:-([0-9A-Za-z]+))?$/))) await renderLaw(m[1], m[2]);
    else if (h === "search" && lastQuery) { filterState.expanded.clear(); await renderSearch(lastQuery); }
    else { $("#q").value = ""; renderHome(); window.scrollTo(0, 0); }
  } catch (e) {
    main.innerHTML = `<div class="empty">자료를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.<br><small>${esc(e.message)}</small></div>`;
  }
}

$("#searchForm").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("#q").value.trim();
  if (!q) return;
  filterState.doc = "all";
  lastQuery = q;
  try { sessionStorage.setItem("q", q); } catch (err) {}
  if (location.hash === "#search") route(); else location.hash = "search";
  $("#q").blur();
});
window.addEventListener("hashchange", route);

(async () => {
  try {
    INDEX = await getJSON("data/index.json");
  } catch (e) {
    main.innerHTML = `<div class="empty">법령 목록을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.</div>`;
    return;
  }
  for (const g of INDEX.groups) for (const d of g.docs) META.set(d.id, d);
  $("#foot").innerHTML = `출처: ${esc(INDEX.source)} · 자료 기준일 ${ymd(INDEX.fetchedAt.slice(0, 10).replace(/-/g, ""))} · 법적 효력이 있는 원문은 국가법령정보센터에서 확인하세요.`;
  route();
})();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
