"""국가법령정보센터에서 받은 원본 파일(laws-raw-*.json)을 앱이 읽는 작은 파일들로 바꾼다.

사용법:  python3 tools/build-data.py laws-raw-YYYYMMDD.json [추가 원본 파일 ...]
결과:    app/data/index.json (법령 목록, 최근 개정 목록)
         app/data/laws/<법령ID>.json (법령별 조문)

조문 글은 국가법령정보센터 응답을 그대로 옮기며, 고치거나 덧붙이지 않는다.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "data"

# 앱에 보여줄 순서와 이름 (사용자가 정한 순서)
GROUPS = [
    "근로기준법", "최저임금법", "임금채권보장법", "근로자퇴직급여 보장법",
    "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", "기간제 및 단시간근로자 보호 등에 관한 법률",
    "파견근로자 보호 등에 관한 법률", "직업안정법", "노동조합 및 노동관계조정법",
    "공무원의 노동조합 설립 및 운영 등에 관한 법률", "교원의 노동조합 설립 및 운영 등에 관한 법률",
    "근로자참여 및 협력증진에 관한 법률", "노동위원회법", "산업안전보건법", "중대재해 처벌 등에 관한 법률",
    "산업재해보상보험법", "고용보험법", "고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률",
    "외국인근로자의 고용 등에 관한 법률", "근로복지기본법", "채용절차의 공정화에 관한 법률", "민법",
]
KIND_ORDER = {"법률": 0, "시행령": 1, "시행규칙": 2}


def as_list(x):
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


def texts(x):
    """문자열, 또는 문자열이 겹겹이 든 목록을 줄 목록으로 편다."""
    if x is None:
        return []
    if isinstance(x, str):
        return [x]
    out = []
    for v in as_list(x):
        out.extend(texts(v))
    return out


def clean(s):
    return re.sub(r"[ \t]+", " ", s.replace("　", " ")).strip()


def article_lines(a):
    """조문 하나를 [단계, 글] 줄 목록으로 만든다. 단계 0=조문, 1=항, 2=호, 3=목."""
    lines = []
    head = " ".join(clean(t) for t in texts(a.get("조문내용")) if t.strip())
    # 머리 "제N조(제목)" 은 화면 제목으로 따로 보여주므로 본문에서는 뗀다
    body = re.sub(r"^제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]*\))?\s*", "", head)
    if body:
        lines.append([0, body])
    for hang in as_list(a.get("항")):
        for t in texts(hang.get("항내용")):
            if clean(t):
                lines.append([1, clean(t)])
        for ho in as_list(hang.get("호")):
            for t in texts(ho.get("호내용")):
                if clean(t):
                    lines.append([2, clean(t)])
            for mok in as_list(ho.get("목")):
                for t in texts(mok.get("목내용")):
                    for part in t.split("\n"):
                        if clean(part):
                            lines.append([3, clean(part)])
    return lines


def build_doc(item):
    b = item["body"]
    info = b["기본정보"]
    s = item["search"]
    arts = []
    for a in as_list((b.get("조문") or {}).get("조문단위")):
        if a.get("조문여부") == "전문":
            h = clean(" ".join(texts(a.get("조문내용"))))
            if h:
                arts.append({"h": h})
            continue
        no = "제%s조" % a.get("조문번호", "")
        if a.get("조문가지번호"):
            no += "의%s" % a["조문가지번호"]
        art = {"k": a.get("조문키"), "n": no, "t": a.get("조문제목") or "", "l": article_lines(a)}
        if a.get("조문변경여부") == "Y":
            art["c"] = 1
        if a.get("조문시행일자") and a["조문시행일자"] != info.get("시행일자"):
            art["e"] = a["조문시행일자"]
        if a.get("조문참고자료"):
            art["r"] = clean(" ".join(texts(a["조문참고자료"])))
        arts.append(art)
    reason = [clean(t) for t in texts((b.get("제개정이유") or {}).get("제개정이유내용")) if clean(t)]
    law_kind = info.get("법종구분")
    law_kind = law_kind.get("content") if isinstance(law_kind, dict) else (law_kind or s.get("법령구분명"))
    dept = info.get("소관부처")
    dept = dept.get("content") if isinstance(dept, dict) else (dept or s.get("소관부처명"))
    return {
        "id": info.get("법령ID") or s["법령ID"],
        "mst": s["법령일련번호"],
        "name": info.get("법령명_한글") or s["법령명한글"],
        "group": item["group"],
        "kind": item["kind"],
        "lawKind": law_kind,
        "promDate": info.get("공포일자") or s.get("공포일자"),
        "promNo": str(int(info.get("공포번호") or s.get("공포번호") or 0)),
        "enfDate": info.get("시행일자") or s.get("시행일자"),
        "revType": info.get("제개정구분") or s.get("제개정구분명"),
        "dept": dept,
        "artEnf": info.get("조문시행일자문자열") or "",
        "reason": reason,
        "articles": arts,
    }


def main(paths):
    items, fetched = {}, []
    for p in paths:
        raw = json.loads(Path(p).read_text(encoding="utf-8"))
        fetched.append(raw["fetchedAt"])
        for it in raw["items"]:
            group = "근로복지기본법" if it["group"] == "근로자복지기본법" else it["group"]
            it["group"] = group
            items[(group, it["kind"])] = it
    docs = [build_doc(it) for it in items.values()]
    docs.sort(key=lambda d: (GROUPS.index(d["group"]), KIND_ORDER[d["kind"]]))

    (OUT / "laws").mkdir(parents=True, exist_ok=True)
    for old in (OUT / "laws").glob("*.json"):
        old.unlink()
    meta_keys = ["id", "mst", "name", "group", "kind", "lawKind", "promDate", "promNo", "enfDate", "revType", "dept"]
    for d in docs:
        (OUT / "laws" / (d["id"] + ".json")).write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    groups = []
    for g in GROUPS:
        ds = [{k: d[k] for k in meta_keys} | {"count": sum(1 for a in d["articles"] if "n" in a)} for d in docs if d["group"] == g]
        groups.append({"name": g, "docs": ds})
    recent = sorted(
        ({k: d[k] for k in meta_keys} | {"summary": summary(d["reason"])} for d in docs),
        key=lambda d: (d["promDate"], d["enfDate"]), reverse=True,
    )
    index = {
        "fetchedAt": max(fetched),
        "source": "국가법령정보센터 Open API (law.go.kr)",
        "groups": groups,
        "recent": recent,
    }
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    missing = [g for g in GROUPS if not any(d["group"] == g for d in docs)]
    print("법령 문서 %d개 저장, 빠진 법령: %s" % (len(docs), missing or "없음"))


def summary(reason):
    """제개정이유의 '개정이유 및 주요내용' 첫 문단을 그대로 가져온다(요약하거나 고쳐 쓰지 않음)."""
    for t in reason:
        if t.startswith("[") or t.startswith("◇") or t.startswith("<법") or t.startswith("※"):
            continue
        return t
    return ""


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
