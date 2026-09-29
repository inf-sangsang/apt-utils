"""score/output/*.csv → school/data/*.js 변환.

페이지는 정적 파일이라 CSV를 fetch하지 않고, people_graph와 같은 방식으로
`window.<변수> = {...}` 형태의 JS 파일을 시도별로 나눠 두고 필요할 때만 로드한다.

실행: python3 generate_school_data.py  (apt-utils/school 에서)
"""
import json
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
SRC = HERE / "../../output"          # score/output
DATA = HERE / "data"

SIDO = {
    "서울특별시교육청": "서울", "부산광역시교육청": "부산", "대구광역시교육청": "대구",
    "인천광역시교육청": "인천", "대전광역시교육청": "대전", "울산광역시교육청": "울산",
    "세종특별자치시교육청": "세종", "경기도교육청": "경기", "강원특별자치도교육청": "강원",
    "충청북도교육청": "충북", "충청남도교육청": "충남", "전북특별자치도교육청": "전북",
    "전남광주통합특별시교육청(광주)": "광주", "전남광주통합특별시교육청(전남)": "전남",
    "경상북도교육청": "경북", "경상남도교육청": "경남", "제주특별자치도교육청": "제주",
}
ORDER = ["서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종",
         "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]
CODE = {s: f"{i + 1:02d}" for i, s in enumerate(ORDER)}

ELEM_YEARS = [2021, 2022, 2023, 2024, 2025, 2026]
MID_YEARS = [2020, 2021, 2022, 2024, 2025]  # 2023은 학교알리미 서버 오류로 미수집
GRADES = [1, 2, 3, 4, 5, 6]


def num(v, digits=1):
    """NaN은 null로, 정수는 정수로 (파일 크기 줄이기)."""
    if pd.isna(v) or v in (float("inf"), float("-inf")):
        return None  # 1학년이 0명이면 유지율이 무한대가 된다
    v = round(float(v), digits)
    return int(v) if v == int(v) else v


def sigungu(df: pd.DataFrame) -> pd.Series:
    """지역이 비어 있는 소수 학교는 교육지원청 이름에서 시군구를 뽑아 채운다."""
    # '경기도 수원시 영통구' → '수원시 영통구' (시도명만 떼어내 구 이름만 남지 않게 한다)
    base = df["지역"].fillna("").str.split().apply(
        lambda parts: " ".join(parts[1:]) if len(parts) > 1 else (parts[0] if parts else ""))
    # '경기도화성오산교육지원청' → '화성오산' (시도명과 접미사를 떼어낸다)
    alt = df["교육지원청"].fillna("").str.replace("교육지원청", "", regex=False)
    for full in sorted({k.replace("교육청", "") for k in SIDO}, key=len, reverse=True):
        alt = alt.str.replace(full, "", regex=False)
    alt = alt.str.strip()
    return base.where(base != "", alt).replace("", "기타")


def series(g: pd.DataFrame, years, col, digits=1):
    by = g.set_index("공시년도")[col]
    return [num(by.get(y), digits) for y in years]


def write_js(path: Path, var: str, payload):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    path.write_text(f"window.{var} = {body};\n", encoding="utf-8")
    return path.stat().st_size


def build_elementary():
    t = pd.read_csv(SRC / "초등학교_학년별학생수_2021-2026.csv")
    coh = pd.read_csv(SRC / "초등학교_코호트추적_전체.csv")
    coh = coh[coh["입학년도"] == 2021].set_index("학교코드")

    t["시도"] = t["시도교육청"].map(SIDO)
    t["시군구"] = sigungu(t)
    out = {}
    for sido, part in t.groupby("시도"):
        schools = []
        for code, g in part.groupby("학교코드"):
            last = g.sort_values("공시년도").iloc[-1]
            c = coh.loc[code] if code in coh.index else None
            cohort = [num(c[f"{i}학년"]) for i in GRADES] if c is not None else [None] * 6
            schools.append({
                "c": code, "n": last["학교명"], "g": last["시군구"], "f": last["설립구분"],
                "t": series(g, ELEM_YEARS, "전교생수", 0),
                "cs": series(g, ELEM_YEARS, "학급당학생수"),
                "cl": series(g, ELEM_YEARS, "총학급수", 0),
                "gr": [series(g, ELEM_YEARS, f"{i}학년_학생수", 0) for i in GRADES],
                "coh": cohort,
                "cr": num(c["유지율(%)"]) if c is not None else None,
            })
        schools.sort(key=lambda s: (-(s["t"][-1] or 0), s["n"]))
        out[sido] = schools
    return out


def build_middle():
    rate = pd.read_csv(SRC / "중학교_고교진학률_2020-2025.csv", low_memory=False)
    elite = pd.read_csv(SRC / "중학교_특목자사고_진학자_2020-2025.csv")
    ach = pd.read_csv(SRC / "중학교_학업성취도_정제.csv")
    ach = ach[ach["학교코드"].notna()].set_index("학교코드")

    # 비율은 '자사고 포함/제외' 토글에 따라 화면에서 계산하므로 인원만 넘긴다
    m = rate.merge(elite[["공시년도", "학교코드", "과학고", "외고·국제고", "자사고",
                          "기타(영재학교 포함, 분리불가)"]],
                   on=["공시년도", "학교코드"], how="left")
    m = m[m["졸업자"] > 0].copy()
    m["시도"] = m["시도교육청"].map(SIDO)
    m["시군구"] = sigungu(m)

    out = {}
    for sido, part in m.groupby("시도"):
        schools = []
        for code, g in part.groupby("학교코드"):
            last = g.sort_values("공시년도").iloc[-1]
            row = {
                "c": code, "n": last["학교명"], "g": last["시군구"], "f": last["설립구분"],
                "grad": series(g, MID_YEARS, "졸업자", 0),
                "sci": series(g, MID_YEARS, "과학고", 0),
                "fl": series(g, MID_YEARS, "외고·국제고", 0),
                "au": series(g, MID_YEARS, "자사고", 0),
                "etc": series(g, MID_YEARS, "기타(영재학교 포함, 분리불가)", 0),
            }
            if code in ach.index:
                a = ach.loc[code]
                row["ach"] = {"avg": num(a["평균"]), "kor": num(a["국어"]),
                              "eng": num(a["영어"]), "math": num(a["수학"]),
                              "n": num(a["응시자수"], 0)}
            schools.append(row)
        schools.sort(key=lambda s: (-(s["grad"][-1] or 0), s["n"]))
        out[sido] = schools
    return out


def main():
    DATA.mkdir(exist_ok=True)
    elem, mid = build_elementary(), build_middle()

    index, total = {}, 0
    for sido in ORDER:
        code = CODE[sido]
        e, mi = elem.get(sido, []), mid.get(sido, [])
        total += write_js(DATA / f"elem_{code}.js", f"schoolElem_{code}",
                          {"sido": sido, "years": ELEM_YEARS, "schools": e})
        total += write_js(DATA / f"mid_{code}.js", f"schoolMid_{code}",
                          {"sido": sido, "years": MID_YEARS, "schools": mi})
        index[sido] = {
            "code": code, "elem": len(e), "mid": len(mi),
            "sggElem": sorted({s["g"] for s in e}),
            "sggMid": sorted({s["g"] for s in mi}),
        }
    total += write_js(DATA / "regionIndex.js", "schoolRegionIndex",
                      {"order": ORDER, "regions": index,
                       "elemYears": ELEM_YEARS, "midYears": MID_YEARS})

    # 검증: 원본 CSV 합계와 일치하는지
    t = pd.read_csv(SRC / "초등학교_학년별학생수_2021-2026.csv")
    src_elem = t["학교코드"].nunique()
    out_elem = sum(len(v) for v in elem.values())
    src_last = t[t["공시년도"] == ELEM_YEARS[-1]]["전교생수"].sum()
    out_last = sum(s["t"][-1] or 0 for v in elem.values() for s in v)
    print(f"초등 학교수 CSV {src_elem} / JS {out_elem}"
          f"{'  ✓' if src_elem == out_elem else '  ✗ 불일치'}")
    print(f"초등 {ELEM_YEARS[-1]} 전교생 CSV {src_last:,.0f} / JS {out_last:,.0f}"
          f"{'  ✓' if abs(src_last - out_last) < 1 else '  ✗ 불일치'}")
    print(f"중등 학교수 JS {sum(len(v) for v in mid.values())}, "
          f"성취도 보유 {sum(1 for v in mid.values() for s in v if 'ach' in s)}")
    print(f"데이터 파일 {len(ORDER) * 2 + 1}개, 합계 {total / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
