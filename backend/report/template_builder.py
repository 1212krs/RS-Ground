# -*- coding: utf-8 -*-
"""평범한 hwpx 문서 → 보고서 서식(템플릿) 자동 변환.

담당자가 한글에서 자리마다 [[제목]] [[개요]] [[대제목]] [[소제목]] 같은 '표시어'만
적어 올리면, 이 모듈이 그것을 엔진이 아는 마커({{TITLE}}, ○ {{ITEM}} …)로 바꿔
바로 쓸 수 있는 서식 파일로 만들어 준다.

세 단계로 검사하고, 실패하면 담당자가 무엇을 고쳐야 하는지 한국어로 돌려준다:
  1차 파일 검사   — 문서보안(DRM)·형식·손상 여부                     (check_file)
  2차 변환·구조   — 표시어 인식, 개수·순서·표 규칙                   (convert)
  3차 시험 생성   — 실제로 문서를 한 번 만들어 보고 성공해야 통과     (convert 끝부분)

설계 요점:
  - 표시어는 반드시 [[ ]] 로 감싼다. 그냥 '제목'이라고 쓰면 본문에 우연히 들어간
    같은 낱말까지 바뀌므로 허용하지 않고, 대신 친절한 안내 문구를 돌려준다.
  - 한글은 한 줄 안에서 글꼴이 바뀌면 글자를 여러 조각으로 쪼개 저장한다.
    그래서 조각 단위가 아니라 '문단 전체 글자를 이어붙여' 표시어를 찾는다.
  - 목차별 견본(목차/□/○/-)은 원본 위치에서 걷어낸 뒤 한 덩어리로 다시 끼워 넣는다.
    engine.build_hwpx 가 '첫 견본 ~ - 견본'까지를 통째로 치환하기 때문에, 그 사이에
    다른 문장이 끼어 있으면 소리 없이 지워지는데, 이렇게 하면 그 사고가 원천 차단된다.
"""

from __future__ import annotations

import io
import os
import re
import tempfile
import zipfile
from pathlib import Path

from .engine import (TEMPLATES_DIR, USER_TEMPLATES_DIR, analyze_template,
                     build_hwpx, form_to_doc)

# 표시어 → 엔진 마커. (표시어, 마커, 여러 번 쓸 수 있는지)
WORD_MARKERS = [
    ("제목",   "{{TITLE}}",         False),
    ("개요",   "{{OVERVIEW}}",      False),
    ("목차",   "1. {{SEC}}",        True),
    ("대항목", "□ {{HEAD}}",        True),
    ("대제목", "○ {{ITEM}}",        True),
    ("소제목", "- {{SUB}}",         True),
    ("표제목", "[{{TBL_CAPTION}}]", False),
    ("머리글", "{{TH}}",            True),
    ("표내용", "{{TD}}",            True),
]
WORD_OF_MARKER = {m: w for w, m, _ in WORD_MARKERS}

# 목차 안에서 차례로 놓여야 하는 견본 4종 (순서 그대로가 조립 순서)
BLOCK_ORDER = ["1. {{SEC}}", "□ {{HEAD}}", "○ {{ITEM}}", "- {{SUB}}"]
BLOCK_REQUIRED = ["○ {{ITEM}}", "- {{SUB}}"]

MAX_NAME_LEN = 40
_SECTION_BAR = r'<hp:tbl[^>]*rowCnt="1" colCnt="2".*?</hp:tbl>'


class ConvertError(Exception):
    """담당자에게 그대로 보여줄 수 있는 실패 사유 묶음."""

    def __init__(self, errors: list[str], warnings: list[str] | None = None):
        super().__init__(errors[0] if errors else "변환 실패")
        self.errors = errors
        self.warnings = warnings or []


# ────────────────────────────────────────────────────────────────
#  1차 — 파일 검사
# ────────────────────────────────────────────────────────────────
def check_file(filename: str, data: bytes) -> tuple[dict, list[str], list[str]]:
    """열리는 파일인지부터 본다. → (zip 부품들, 순서, 경고)"""
    ext = os.path.splitext(filename or "")[1].lower()
    if data[:2] != b"PK":
        if data[:4] == b"SCDS" or data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
            raise ConvertError([
                "문서보안(DRM)이 적용된 파일이라 내용을 읽을 수 없습니다. "
                "보안을 해제한 뒤 다시 올려주세요."])
        raise ConvertError([
            "hwpx 형식이 아닙니다%s. 한글에서 '다른 이름으로 저장 → 한글 문서(*.hwpx)'로 "
            "저장한 파일을 올려주세요." % ((" (%s)" % ext) if ext else "")])

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = z.namelist()
            parts = {n: z.read(n) for n in names}
    except Exception as ex:
        raise ConvertError(["파일이 손상되어 열 수 없습니다 (%s). 다시 올려주세요."
                            % type(ex).__name__])

    if "Contents/section0.xml" not in parts:
        raise ConvertError(["hwpx 내부 구조가 예상과 달라 본문을 찾을 수 없습니다. "
                            "한글에서 새로 저장한 파일을 올려주세요."])

    warnings = []
    others = [n for n in names if re.match(r"Contents/section[1-9]\d*\.xml$", n)]
    if others:
        warnings.append("문서가 구역 %d개로 나뉘어 있습니다. 첫 구역만 서식으로 쓰이므로, "
                        "표시어는 모두 첫 구역에 넣어주세요." % (len(others) + 1))
    if "mimetype" not in parts:
        warnings.append("파일에 mimetype 정보가 없습니다. 만든 문서가 한글에서 열리지 "
                        "않으면 원본을 한글에서 다시 저장해 주세요.")
    return parts, names, warnings


# ────────────────────────────────────────────────────────────────
#  XML 문단 다루기
# ────────────────────────────────────────────────────────────────
def _inner_paragraphs(xml: str) -> list[tuple[int, int]]:
    """가장 안쪽 문단들의 (시작, 끝)을 문서 순서대로. 표 칸 안의 문단도 여기 잡힌다.

    engine._para_span 과 같은 전제(중첩 없는 문단)를 쓰므로 여는 태그는 '<hp:p ' 로 찾는다."""
    spans, i = [], 0
    while True:
        s = xml.find("<hp:p ", i)
        if s == -1:
            break
        e = xml.find("</hp:p>", s)
        if e == -1:
            break
        nxt = xml.find("<hp:p ", s + 1)
        if nxt != -1 and nxt < e:   # 안에 또 문단이 있으면 그건 바깥 문단
            i = nxt
            continue
        spans.append((s, e + len("</hp:p>")))
        i = e + len("</hp:p>")
    return spans


def _text_of(chunk: str) -> str:
    return "".join(re.findall(r"<hp:t>([^<]*)</hp:t>", chunk))


def _apply_edits(xml: str, edits: list[tuple[int, int, str]]) -> str:
    """(시작, 끝, 새내용) 목록을 뒤에서부터 적용 — 앞쪽 위치가 밀리지 않게."""
    for s, e, rep in sorted(edits, key=lambda t: t[0], reverse=True):
        xml = xml[:s] + rep + xml[e:]
    return xml


def _set_para_text(chunk: str, text: str) -> str:
    """문단의 첫 글자조각에 text를 넣고 나머지 조각은 비운다(조각 쪼개짐 대응)."""
    done = [False]

    def one(m):
        if done[0]:
            return "<hp:t></hp:t>"
        done[0] = True
        return "<hp:t>%s</hp:t>" % text
    return re.sub(r"<hp:t>[^<]*</hp:t>", one, chunk)


# ────────────────────────────────────────────────────────────────
#  2차 — 표시어 → 마커
# ────────────────────────────────────────────────────────────────
def _replace_words(xml: str) -> tuple[str, dict, list[str]]:
    """[[표시어]] 를 마커로 치환. → (새 xml, 마커별 개수, 오류)"""
    bare_hits: dict[str, int] = {}
    counts: dict[str, int] = {}
    edits = []
    word_to_marker = {w: m for w, m, _ in WORD_MARKERS}

    for s, e in _inner_paragraphs(xml):
        chunk = xml[s:e]
        txt = _text_of(chunk).strip()
        if not txt:
            continue
        m = re.fullmatch(r"\[\[\s*([^\[\]]+?)\s*\]\]", txt)
        if m:
            word = m.group(1)
            marker = word_to_marker.get(word)
            if marker is None:
                bare_hits.setdefault("__unknown__:" + word, 0)
                bare_hits["__unknown__:" + word] += 1
                continue
            counts[marker] = counts.get(marker, 0) + 1
            edits.append((s, e, _set_para_text(chunk, marker)))
        elif txt in word_to_marker:
            bare_hits[txt] = bare_hits.get(txt, 0) + 1

    errors = []
    unknown = {k.split(":", 1)[1]: v for k, v in bare_hits.items() if k.startswith("__unknown__:")}
    if unknown:
        errors.append("알 수 없는 표시어입니다: %s → 쓸 수 있는 표시어는 %s 입니다."
                      % (", ".join("[[%s]]" % u for u in unknown),
                         ", ".join("[[%s]]" % w for w, _, _ in WORD_MARKERS)))
    plain = {k: v for k, v in bare_hits.items() if not k.startswith("__unknown__:")}
    if plain and not counts:
        errors.append("표시어는 대괄호 두 개로 감싸야 합니다. %s 처럼 적어주세요. "
                      "(지금은 %s 라고만 적혀 있습니다)"
                      % (", ".join("[[%s]]" % k for k in plain), ", ".join(plain)))
    elif plain:
        errors.append("대괄호가 빠진 표시어가 있습니다: %s → %s 로 고쳐주세요."
                      % (", ".join(plain), ", ".join("[[%s]]" % k for k in plain)))
    return _apply_edits(xml, edits), counts, errors


# ────────────────────────────────────────────────────────────────
#  2차 — 견본 개수·순서 정리
# ────────────────────────────────────────────────────────────────
def _section_bars(xml: str) -> list[tuple[int, int, str]]:
    """목차 구분 막대(1행 2열 표)의 (시작, 끝, 이름)."""
    out = []
    for m in re.finditer(_SECTION_BAR, xml, flags=re.S):
        cells = [t.strip() for t in re.findall(r"<hp:t>([^<]*)</hp:t>", m.group(0)) if t.strip()]
        label = next((c for c in cells if not c.isdigit()), None)
        out.append((m.start(), m.end(), label or ""))
    return out


def _normalize_blocks(xml: str) -> tuple[str, list[str], list[str], list[str]]:
    """목차마다 견본 한 벌(목차?/□?/○/-)만 순서대로 남기고 나머지는 정리한다.

    → (새 xml, 목차이름들, 자동으로 고친 내용, 오류)"""
    steps, errors = [], []
    bars = _section_bars(xml)

    # 견본으로 쓸 문단 원본을 마커 종류별로 하나씩 확보 (서식·글꼴이 그대로 복제된다)
    samples: dict[str, str] = {}
    paras = _inner_paragraphs(xml)
    for s, e in paras:
        txt = _text_of(xml[s:e]).strip()
        if txt in BLOCK_ORDER and txt not in samples:
            samples[txt] = xml[s:e]

    missing = [WORD_OF_MARKER[m] for m in BLOCK_REQUIRED if m not in samples]
    if missing:
        errors.append("필수 표시어가 없습니다: %s. 본문에 %s 를 넣어주세요."
                      % (", ".join("[[%s]]" % w for w in missing),
                         " 와 ".join("[[%s]]" % w for w in missing)))
        return xml, [], steps, errors

    use = [m for m in BLOCK_ORDER if m in samples]   # 이 서식이 쓰는 단계들

    # 문단을 목차 구역별로 나눈다. 구역 0 = 첫 목차 막대 앞(제목·개요 영역)
    # 목차 막대가 아예 없는 서식(보도자료 등)은 문서 전체가 '본문' 한 구역이다.
    def region_of(pos: int) -> int:
        return sum(1 for b in bars if b[0] < pos) if bars else 1

    region_paras: dict[int, list[tuple[int, int, str]]] = {}
    for s, e in paras:
        txt = _text_of(xml[s:e]).strip()
        if txt in BLOCK_ORDER:
            region_paras.setdefault(region_of(s), []).append((s, e, txt))

    if 0 in region_paras and bars:
        errors.append("첫 목차 막대보다 위에 %s 가 있습니다. 항목 표시어는 목차 막대 아래에 "
                      "넣어주세요." % ", ".join("[[%s]]" % WORD_OF_MARKER[t]
                                              for _, _, t in region_paras[0]))
        return xml, [], steps, errors

    n_regions = len(bars) if bars else 1
    labels = [b[2] or "본문" for b in bars] if bars else ["본문"]

    edits = []
    for r in range(1, n_regions + 1):
        found = region_paras.get(r, [])
        if not found:
            errors.append("'%s' 목차에 항목 표시어가 하나도 없습니다. [[대제목]] 과 [[소제목]] 을 "
                          "넣어주세요." % labels[r - 1])
            continue
        kinds = [t for _, _, t in found]
        dup = len(found) - len(set(kinds))
        if dup:
            steps.append("'%s' 목차에서 중복된 표시어 %d개를 정리했습니다." % (labels[r - 1], dup))
        added = [WORD_OF_MARKER[m] for m in use if m not in kinds]
        if added:
            steps.append("'%s' 목차에 빠진 표시어를 자동으로 채웠습니다: %s"
                         % (labels[r - 1], ", ".join("[[%s]]" % a for a in added)))
        # 기존 견본 문단은 전부 걷어내고, 첫 자리에 한 벌을 순서대로 다시 끼워 넣는다
        block = "".join(samples[m] for m in use)
        anchor = found[0][0]
        for s, e, _t in found:
            edits.append((s, e, block if s == anchor else ""))

    if errors:
        return xml, labels, steps, errors
    return _apply_edits(xml, edits), labels, steps, errors


# ────────────────────────────────────────────────────────────────
#  2차 — 표·문서 구조 검사
# ────────────────────────────────────────────────────────────────
def _check_table(xml: str) -> tuple[list[str], list[str]]:
    """표 3종 세트와 4열 규칙을 본다. → (오류, 경고)"""
    errors, warnings = [], []
    present = {m: xml.count(m) for m in ("{{TBL_CAPTION}}", "{{TH}}", "{{TD}}")}
    used = [m for m, c in present.items() if c]
    if not used:
        return errors, warnings
    if len(used) != 3:
        word = {"{{TBL_CAPTION}}": "표제목", "{{TH}}": "머리글", "{{TD}}": "표내용"}
        lost = [word[m] for m, c in present.items() if not c]
        errors.append("표를 쓰시려면 [[표제목]] · [[머리글]] · [[표내용]] 을 모두 넣어야 합니다. "
                      "지금 빠진 것: %s" % ", ".join("[[%s]]" % x for x in lost))
        return errors, warnings
    if present["{{TBL_CAPTION}}"] > 1:
        errors.append("[[표제목]] 은 한 곳에만 넣어주세요. (현재 %d곳)" % present["{{TBL_CAPTION}}"])
    if present["{{TH}}"] != 4:
        errors.append("표는 4칸 고정입니다. [[머리글]] 을 정확히 4칸에 넣어주세요. (현재 %d칸)"
                      % present["{{TH}}"])
    if present["{{TD}}"] < 4 or present["{{TD}}"] % 4:
        errors.append("[[표내용]] 은 한 줄에 4칸씩 넣어주세요. (현재 %d칸)" % present["{{TD}}"])

    trs = re.findall(r"<hp:tr>.*?</hp:tr>", xml, flags=re.S)
    seed = next((t for t in trs if "{{TD}}" in t), "")
    if seed and 'rowAddr="1"' not in seed:
        warnings.append("표의 내용 줄이 표 안 첫 줄이 아닌 것 같습니다. 만든 문서에서 표가 "
                        "어긋나면 머리글 줄 바로 아래에 [[표내용]] 줄을 두세요.")
    return errors, warnings


def _check_document(xml: str) -> list[str]:
    errors = []
    if "</hp:tbl>" not in xml:
        errors.append("문서에 표가 하나도 없습니다. 파주시 서식처럼 맨 위에 제목 상자(표)를 "
                      "하나 넣어주세요. (문서 생성 규칙상 필요합니다)")
    if "{{TITLE}}" not in xml:
        errors.append("[[제목]] 이 없습니다. 문서 제목이 들어갈 자리에 넣어주세요.")
    return errors


# ────────────────────────────────────────────────────────────────
#  3차 — 시험 생성
# ────────────────────────────────────────────────────────────────
_TRIAL_TEXT = "○ 시험용 항목입니다\n- 시험용 세부 내용입니다\n○ 두 번째 시험 항목입니다"


def _trial(data: bytes) -> tuple[dict, list[str]]:
    """진짜 엔진으로 문서를 한 번 만들어 본다. → (서식 정보, 오류)"""
    fd, path = tempfile.mkstemp(suffix=".hwpx")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        p = Path(path)
        try:
            tpl = analyze_template(p)
        except Exception as ex:
            return {}, ["서식 규칙 검사에서 걸렸습니다: %s" % ex]
        n = len(tpl["sections"])
        feats = tpl["features"]
        payload = {
            "title": "서식 시험 문서",
            "overview": "시험용 개요입니다.",
            "sections": [_TRIAL_TEXT] * n,
            "include_table": feats.get("table", False),
            "table": {"caption": "시험 표", "headers": ["구분", "내용", "시기", "담당"],
                      "rows": [["1", "시험", "8월", "담당부서"]], "section": n},
        }
        try:
            blob = build_hwpx(form_to_doc(payload, tpl), tpl)
        except Exception as ex:
            return tpl, ["시험 문서를 만드는 중 실패했습니다: %s" % ex]
        if len(blob) < 1000:
            return tpl, ["시험 문서가 비정상적으로 작습니다. 원본 서식을 확인해 주세요."]
        return tpl, []
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


# ────────────────────────────────────────────────────────────────
#  전체 흐름
# ────────────────────────────────────────────────────────────────
def convert(filename: str, data: bytes) -> dict:
    """평문 hwpx → 서식 hwpx. 실패하면 ConvertError 로 사유를 던진다."""
    parts, order, warnings = check_file(filename, data)
    xml = parts["Contents/section0.xml"].decode("utf-8")

    if "<hp:p>" in xml:
        warnings.append("문서 안에 속성 없는 문단이 있어 일부가 인식되지 않을 수 있습니다.")

    xml, counts, errors = _replace_words(xml)
    if errors:
        raise ConvertError(errors, warnings)
    if not counts:
        raise ConvertError(["표시어를 하나도 찾지 못했습니다. 한글에서 [[제목]] [[대제목]] "
                            "[[소제목]] 처럼 대괄호 두 개로 감싸 적어주세요. "
                            "표시어 한 개는 한 줄에 단독으로 적어야 합니다."], warnings)

    steps = ["표시어 %d곳을 서식 마커로 바꿨습니다." % sum(counts.values())]
    xml, labels, s2, errors = _normalize_blocks(xml)
    steps += s2
    if errors:
        raise ConvertError(errors, warnings)

    e3, w3 = _check_table(xml)
    warnings += w3
    errors += e3 + _check_document(xml)
    if errors:
        raise ConvertError(errors, warnings)

    parts["Contents/section0.xml"] = xml.encode("utf-8")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        if "mimetype" in parts:
            zout.writestr("mimetype", parts["mimetype"], zipfile.ZIP_STORED)
        for name in order:
            if name != "mimetype":
                zout.writestr(name, parts[name])
    blob = buf.getvalue()

    tpl, errors = _trial(blob)
    if errors:
        raise ConvertError(errors, warnings)
    steps.append("시험 문서를 실제로 만들어 보고 정상 생성을 확인했습니다.")

    return {"data": blob, "sections": tpl["sections"], "features": tpl["features"],
            "steps": steps, "warnings": warnings}


# ────────────────────────────────────────────────────────────────
#  저장·삭제
# ────────────────────────────────────────────────────────────────
def safe_name(name: str) -> str:
    """서식 이름 검사. 글자를 몰래 지우지 않고, 문제가 있으면 이유를 알려 거부한다."""
    name = (name or "").strip()
    if not name:
        raise ConvertError(["서식 이름을 입력하세요."])
    if len(name) > MAX_NAME_LEN:
        raise ConvertError(["서식 이름은 %d자까지 가능합니다. (현재 %d자)" % (MAX_NAME_LEN, len(name))])
    bad = sorted(set(re.findall(r'[\\/:*?"<>|.]', name)))
    if bad:
        raise ConvertError(["서식 이름에 쓸 수 없는 문자가 있습니다: %s" % " ".join(bad)])
    if name.startswith("_"):
        raise ConvertError(["서식 이름은 밑줄(_)로 시작할 수 없습니다. (공통지침 파일과 구분하기 위함)"])
    return name


def save(name: str, blob: bytes, guide: str = "", overwrite: bool = False) -> dict:
    """등록 서식 폴더(영구 볼륨)에 저장한다. 기본 서식 폴더는 재배포 때 덮이므로 쓰지 않는다."""
    name = safe_name(name)
    path = USER_TEMPLATES_DIR / (name + ".hwpx")
    if not overwrite:
        if path.exists():
            raise ConvertError(["'%s' 서식이 이미 있습니다. 덮어쓰려면 다시 확인해 주세요." % name])
        if (TEMPLATES_DIR / (name + ".hwpx")).exists():
            raise ConvertError(["'%s' 은(는) 기본 서식 이름입니다. 그대로 등록하면 앞으로 기본 서식 "
                                "대신 이 서식이 쓰입니다. 계속하려면 다시 확인해 주세요." % name])
    USER_TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)
    guide = (guide or "").strip()
    gp = USER_TEMPLATES_DIR / (name + ".md")
    if guide:
        gp.write_text(guide, encoding="utf-8")
    elif not gp.exists() and (TEMPLATES_DIR / (name + ".md")).exists():
        # 기본 서식을 덮어쓰는 경우, 원래 있던 작성 지침을 함께 가져와 이어 쓴다
        gp.write_text((TEMPLATES_DIR / (name + ".md")).read_text(encoding="utf-8-sig"),
                      encoding="utf-8")
    return {"id": name, "name": name, "has_guide": gp.exists()}


def delete(tpl_id: str) -> list[str]:
    """등록 서식만 지운다. 기본 서식은 코드와 함께 배포되므로 지워도 재배포 때 되살아난다."""
    name = safe_name(tpl_id)
    path = USER_TEMPLATES_DIR / (name + ".hwpx")
    if not path.exists():
        if (TEMPLATES_DIR / (name + ".hwpx")).exists():
            raise ConvertError(["'%s' 은(는) 기본 서식이라 화면에서 지울 수 없습니다. "
                                "바꾸시려면 같은 이름으로 새 서식을 등록하세요." % name])
        raise ConvertError(["'%s' 서식을 찾을 수 없습니다." % name])
    removed = [name + ".hwpx"]
    path.unlink()
    gp = USER_TEMPLATES_DIR / (name + ".md")
    if gp.exists():
        gp.unlink()
        removed.append(name + ".md")
    return removed
