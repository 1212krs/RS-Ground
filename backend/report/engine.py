# -*- coding: utf-8 -*-
"""HWPX 보고서 조립 엔진.

동작 원리(개념):
  .hwpx 파일은 사실 ZIP 압축파일이고, 안에 XML(문서 설계도)이 들어 있다.
  templates/ 폴더의 서식 hwpx 안에는 {{TITLE}}, {{ITEM}} 같은 '마커'가 심어져
  있어서, 이 모듈이 ① 마커를 실제 내용으로 바꾸고 ② 항목(○/―)·표 견본을
  필요한 개수만큼 복제해 끼워넣은 뒤 ③ 다시 ZIP으로 묶어 완성본을 만든다.
  한글 프로그램 없이 순수 파이썬(표준 라이브러리)만 사용한다.

템플릿 세트 규약:
  templates/서식이름.hwpx  ← 문서 구조·디자인 (마커 포함, 필수)
  templates/서식이름.md    ← 그 서식의 작성 지침 (선택, AI 프롬프트에 주입)
  templates/_공통지침.md   ← 모든 서식에 공통 적용되는 지침 (선택)

주의: 기관 PC의 문서보안(DRM)이 hwpx를 암호화하면(파일 시그니처가 PK가 아니게 됨)
      ZIP으로 열 수 없어 해당 서식은 목록에서 자동 제외된다(사유는 서버 로그).
"""

from __future__ import annotations

import io
import os
import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape
import xml.etree.ElementTree as ET

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
COMMON_GUIDE_PATH = TEMPLATES_DIR / "_공통지침.md"

REQUIRED_MARKERS = ["{{TITLE}}", "{{OVERVIEW}}", "○ {{ITEM}}", "- {{SUB}}",
                    "{{TBL_CAPTION}}", "{{TH}}", "{{TD}}"]

_tpl_cache: dict = {}


# ────────────────────────────────────────────────────────────────
#  템플릿 레지스트리
# ────────────────────────────────────────────────────────────────
def _guide_path(path: Path) -> Path | None:
    for ext in (".md", ".txt"):
        gp = path.with_suffix(ext)
        if gp.exists():
            return gp
    return None


def analyze_template(path: Path) -> dict:
    """마커 무결성 검증 + 섹션 바(1x2 표)에서 목차 자동 추출 + 지침 사이드카 로드."""
    gp = _guide_path(path)
    key = (str(path), path.stat().st_mtime, gp.stat().st_mtime if gp else None)
    if key in _tpl_cache:
        return _tpl_cache[key]

    with zipfile.ZipFile(path) as z:
        xml = z.read("Contents/section0.xml").decode("utf-8")

    missing = [m for m in REQUIRED_MARKERS if m not in xml]
    if missing:
        raise ValueError("마커 누락: %s" % ", ".join(missing))

    labels = []
    for m in re.finditer(r'<hp:tbl[^>]*rowCnt="1" colCnt="2".*?</hp:tbl>', xml, flags=re.S):
        cells = [t.strip() for t in re.findall(r"<hp:t>([^<]*)</hp:t>", m.group(0)) if t.strip()]
        label = next((c for c in cells if not c.isdigit()), None)
        if label:
            labels.append(label)
    n_item = xml.count("○ {{ITEM}}")
    if labels:
        if n_item != len(labels):
            raise ValueError("섹션 %d개 ≠ ITEM 견본 %d개" % (len(labels), n_item))
    else:
        # 섹션 바가 없는 서식(보도자료 등)은 단일 '본문' 섹션으로 취급
        if n_item != 1:
            raise ValueError("섹션 바 없는 서식은 ITEM 견본이 1개여야 함 (현재 %d개)" % n_item)
        labels = ["본문"]

    guide = gp.read_text(encoding="utf-8-sig").strip() if gp else ""

    info = {"id": path.stem, "name": path.stem, "path": str(path),
            "sections": labels, "guide": guide}
    _tpl_cache[key] = info
    return info


def list_templates() -> list[dict]:
    out = []
    for fn in sorted(TEMPLATES_DIR.glob("*.hwpx")):
        try:
            out.append(analyze_template(fn))
        except Exception as ex:  # DRM 감염·마커 훼손 등 — 해당 서식만 제외
            print("[report] 템플릿 제외 %s: %s" % (fn.name, ex))
    return out


def get_template(tpl_id: str) -> dict:
    tpls = list_templates()
    if not tpls:
        raise RuntimeError("templates/ 에 유효한 서식이 없습니다: %s" % TEMPLATES_DIR)
    return next((t for t in tpls if t["id"] == tpl_id), tpls[0])


def common_guide() -> str:
    if COMMON_GUIDE_PATH.exists():
        return COMMON_GUIDE_PATH.read_text(encoding="utf-8-sig").strip()
    return ""


# ────────────────────────────────────────────────────────────────
#  XML 조각 유틸 (문단·표 경계 탐색)
# ────────────────────────────────────────────────────────────────
def _para_span(xml: str, pos: int) -> tuple[int, int]:
    """pos를 포함하는 (중첩 없는) 문단의 (시작, 끝) 위치."""
    s = xml.rfind("<hp:p ", 0, pos)
    e = xml.find("</hp:p>", pos) + len("</hp:p>")
    return s, e


def _remove_para_with(xml: str, needle: str) -> str:
    i = xml.find(needle)
    if i == -1:
        return xml
    s, e = _para_span(xml, i)
    return xml[:s] + xml[e:]


def _tbl_end(xml: str, start: int) -> int:
    """start의 <hp:tbl>부터 짝이 맞는 </hp:tbl> 끝 위치 (중첩 안전)."""
    depth, i = 0, start
    while True:
        o = xml.find("<hp:tbl", i)
        c = xml.find("</hp:tbl>", i)
        if o != -1 and o < c:
            depth += 1
            i = o + 7
        else:
            depth -= 1
            i = c + len("</hp:tbl>")
            if depth == 0:
                return i


def _extract_table_parts(xml: str) -> tuple[str, str, str]:
    """캡션 문단 + 표 문단을 템플릿 위치에서 잘라내 이동식 부품으로 반환.
    → (표가 제거된 xml, 캡션 조각, 표 조각)"""
    ci = xml.index("{{TBL_CAPTION}}")
    cs, ce = _para_span(xml, ci)
    cap = xml[cs:ce]
    xml = xml[:cs] + xml[ce:]

    ti = xml.index("{{TH}}")
    ts = xml.rfind("<hp:tbl", 0, ti)
    te = _tbl_end(xml, ts)
    ps = xml.rfind("<hp:p ", 0, ts)
    pe = xml.find("</hp:p>", te) + len("</hp:p>")
    tbl = xml[ps:pe]
    xml = xml[:ps] + xml[pe:]
    return xml, cap, tbl


def _fill_table(fragment: str, table: dict) -> str:
    """표 견본 조각에 헤더/데이터를 채우고 행 수를 맞춘다(행 복제 + rowCnt 갱신)."""
    headers = (list(table.get("headers", [])) + [""] * 4)[:4]
    rows = [((r + [""] * 4)[:4]) for r in table.get("rows", [])] or [["", "", "", ""]]

    ts = fragment.rfind("<hp:tbl", 0, fragment.index("{{TH}}"))
    te = fragment.index("</hp:tbl>", fragment.index("{{TD}}")) + len("</hp:tbl>")
    tbl = fragment[ts:te]

    trs = re.findall(r"<hp:tr>.*?</hp:tr>", tbl, flags=re.S)
    header_tr = next(t for t in trs if "{{TH}}" in t)
    data_seed = next(t for t in trs if "{{TD}}" in t)

    h = header_tr
    for v in headers:
        h = h.replace("<hp:t>{{TH}}</hp:t>", "<hp:t>%s</hp:t>" % escape(v), 1)

    new_rows = []
    for k, r in enumerate(rows):
        d = data_seed.replace('rowAddr="1"', 'rowAddr="%d"' % (k + 1))
        for v in r:
            d = d.replace("<hp:t>{{TD}}</hp:t>", "<hp:t>%s</hp:t>" % escape(v), 1)
        new_rows.append(d)

    first_tr = tbl.index("<hp:tr>")
    last_tr = tbl.rindex("</hp:tr>") + len("</hp:tr>")
    new_tbl = tbl[:first_tr] + h + "".join(new_rows) + tbl[last_tr:]
    new_tbl = re.sub(r'(<hp:tbl[^>]*\browCnt=")\d+(")',
                     lambda m: m.group(1) + str(1 + len(rows)) + m.group(2),
                     new_tbl, count=1)
    return fragment[:ts] + new_tbl + fragment[te:]


def _strip_body_linesegs(xml: str) -> str:
    """본문의 낡은 줄배치표(linesegarray) 제거 → 한글이 열 때 재계산 → 글자 겹침 방지.

    템플릿의 문단에는 '몇 번째 줄을 어디에 그릴지' 캐시가 저장돼 있는데,
    긴 텍스트를 채워 넣으면 이 캐시가 실제 줄 수와 어긋나 글자가 겹쳐 보인다.
    헤더(로고 표) 영역은 이미지 배치 때문에 남겨두고 본문 것만 지운다."""
    first_close = xml.index("</hp:tbl>")
    body_from = xml.index("</hp:p>", first_close) + len("</hp:p>")
    head, body = xml[:body_from], xml[body_from:]
    body = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", body, flags=re.S)
    return head + body


# ────────────────────────────────────────────────────────────────
#  폼 입력 → 문서 구조 → hwpx 조립
# ────────────────────────────────────────────────────────────────
def form_to_doc(data: dict, tpl: dict) -> dict:
    """화면 폼 입력(JSON)을 조립용 문서 구조로 변환한다."""
    n = len(tpl["sections"])

    def parse_section(text: str):
        blocks = []
        for line in (text or "").splitlines():
            t = line.strip()
            if not t:
                continue
            if t[0] in "-―":
                blocks.append(("sub", t.lstrip("-― ").strip()))
            else:
                blocks.append(("item", t.lstrip("○ ").strip()))
        return blocks

    raw = data.get("sections", [])
    doc = {
        "title": (data.get("title") or "").strip() or "제목 없음",
        "overview": (data.get("overview") or "").strip(),
        "sections": [parse_section(raw[i] if i < len(raw) else "") for i in range(n)],
    }
    if data.get("include_table"):
        tbl = data.get("table") or {}
        try:
            section = int(tbl.get("section", n))
        except (TypeError, ValueError):
            section = n
        doc["table"] = {
            "caption": (tbl.get("caption") or "").strip() or "표",
            "headers": [str(c).strip() for c in tbl.get("headers", [])][:4],
            "rows": [[str(c).strip() for c in row] for row in tbl.get("rows", [])
                     if any(str(c).strip() for c in row)],
            "section": min(max(section, 1), n),
        }
    return doc


def build_hwpx(doc: dict, tpl: dict) -> bytes:
    """문서 구조(doc)를 템플릿에 채워 완성 hwpx 바이트를 반환한다."""
    with zipfile.ZipFile(tpl["path"], "r") as zin:
        parts = {i.filename: zin.read(i.filename) for i in zin.infolist()}
        order = [i.filename for i in zin.infolist()]
    xml = parts["Contents/section0.xml"].decode("utf-8")

    # 항목 견본 추출
    s, e = _para_span(xml, xml.index("○ {{ITEM}}")); item_tpl = xml[s:e]
    s, e = _para_span(xml, xml.index("- {{SUB}}")); sub_tpl = xml[s:e]

    # 표를 템플릿 고정 위치에서 잘라내 이동식 부품으로 확보
    xml, cap_tpl, tbl_tpl = _extract_table_parts(xml)

    table = doc.get("table")
    tbl_frag, tbl_at = "", 0
    if table:
        n = len(doc["sections"])
        cap = cap_tpl.replace("{{TBL_CAPTION}}", escape(table["caption"]))
        tbl_frag = cap + _fill_table(tbl_tpl, table)
        tbl_at = min(max(int(table.get("section", n)), 1), n)

    # 섹션별 항목 복제 + 어울리는 섹션 끝에 표 삽입
    for no, blocks in enumerate(doc["sections"], 1):
        frags = []
        for kind, text in blocks:
            if kind == "sub":
                frags.append(sub_tpl.replace("- {{SUB}}", "- " + escape(text)))
            else:
                frags.append(item_tpl.replace("○ {{ITEM}}", "○ " + escape(text)))
        if no == tbl_at:
            frags.append(tbl_frag)
        is_, ie = _para_span(xml, xml.index("○ {{ITEM}}"))
        ss, se = _para_span(xml, xml.index("- {{SUB}}", ie))
        xml = xml[:is_] + "".join(frags) + xml[se:]

    xml = xml.replace("{{TITLE}}", escape(doc["title"]))
    xml = xml.replace("{{OVERVIEW}}", escape(doc["overview"]))
    xml = _strip_body_linesegs(xml)

    # 생성 후 검증: 잔여 마커·XML 문법
    leftover = [m for m in ("{{TITLE}}", "{{OVERVIEW}}", "{{ITEM}}", "{{SUB}}",
                            "{{TBL_CAPTION}}", "{{TH}}", "{{TD}}") if m in xml]
    if leftover:
        raise ValueError("잔여 마커: %s" % leftover)
    ET.fromstring(xml.encode("utf-8"))

    # ZIP 패키징 (mimetype은 무압축으로 첫 항목 — hwpx 규격)
    parts["Contents/section0.xml"] = xml.encode("utf-8")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        if "mimetype" in parts:
            zout.writestr("mimetype", parts["mimetype"], zipfile.ZIP_STORED)
        for name in order:
            if name != "mimetype":
                zout.writestr(name, parts[name])
    return buf.getvalue()
