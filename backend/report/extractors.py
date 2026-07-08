# -*- coding: utf-8 -*-
"""보고서 생성용 참고 파일 텍스트 추출 (표준 라이브러리만 사용).

rag/extractors.py 와 별개인 이유:
  - rag 쪽은 pdfplumber·python-docx 등 외부 라이브러리를 쓰지만,
    여기는 배포 의존성을 늘리지 않으려고 전부 표준 라이브러리로 구현했다.
  - 옛 바이너리 .hwp(OLE 복합문서)까지 지원한다 — rag 쪽은 미지원 형식.

지원 형식: .txt .md .csv (텍스트) / .hwpx .docx (ZIP+XML) / .hwp (OLE)
미지원: PDF(여기서는), 스캔 이미지, DRM 걸린 hwp/hwpx
"""

from __future__ import annotations

import io
import os
import re
import struct
import zipfile
import zlib

# 8워드(16바이트)를 차지하는 HWP 인라인 컨트롤 문자들
_HWP_EXT_CTRL = {1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23}


def hwp_text(data: bytes) -> str:
    """.hwp(OLE 복합문서) 본문 텍스트 추출.

    HWP 5.x는 'OLE 복합문서'라는 컨테이너 안에 압축된 레코드들이 든 구조다.
    ① OLE 컨테이너를 해석해 BodyText/Section* 스트림을 꺼내고
    ② zlib 압축을 풀고 ③ 문단 텍스트 레코드(tag 67)에서 UTF-16 글자를 모은다."""
    assert data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "OLE 파일이 아님(DRM 여부 확인)"
    END, FREE = 0xFFFFFFFE, 0xFFFFFFFF
    ssz = 1 << struct.unpack_from("<H", data, 30)[0]
    mssz = 1 << struct.unpack_from("<H", data, 32)[0]
    dir_start = struct.unpack_from("<I", data, 48)[0]
    mini_cutoff = struct.unpack_from("<I", data, 56)[0]
    minifat_start = struct.unpack_from("<I", data, 60)[0]
    difat_start = struct.unpack_from("<I", data, 68)[0]
    num_difat = struct.unpack_from("<I", data, 72)[0]
    sector = lambda i: data[512 + i * ssz:512 + (i + 1) * ssz]

    difat = list(struct.unpack_from("<109I", data, 76))
    s = difat_start
    for _ in range(num_difat):
        vals = struct.unpack("<%dI" % (ssz // 4), sector(s))
        difat += vals[:-1]
        s = vals[-1]
    fat: list[int] = []
    for fs in difat:
        if fs not in (FREE, END):
            fat += struct.unpack("<%dI" % (ssz // 4), sector(fs))

    def chain(start):
        out, s, seen = [], start, set()
        while s not in (END, FREE) and s not in seen and s < len(fat):
            out.append(s); seen.add(s); s = fat[s]
        return out

    read_chain = lambda st, size: b"".join(sector(x) for x in chain(st))[:size]

    entries = []
    for sec in chain(dir_start):
        raw = sector(sec)
        for off in range(0, ssz, 128):
            e = raw[off:off + 128]
            nlen = struct.unpack_from("<H", e, 64)[0]
            if nlen < 2:
                continue
            entries.append((e[:nlen - 2].decode("utf-16-le", "ignore"), e[66],
                            struct.unpack_from("<I", e, 116)[0],
                            struct.unpack_from("<I", e, 120)[0]))
    root = next(e for e in entries if e[1] == 5)
    mini = read_chain(root[2], root[3])
    minifat: list[int] = []
    if minifat_start not in (FREE, END):
        for sec in chain(minifat_start):
            minifat += struct.unpack("<%dI" % (ssz // 4), sector(sec))

    def read(name):
        e = next(x for x in entries if x[0] == name)
        if e[3] < mini_cutoff and e[1] != 5:
            out, s, seen = [], e[2], set()
            while s not in (END, FREE) and s not in seen and s < len(minifat):
                out.append(mini[s * mssz:(s + 1) * mssz]); seen.add(s); s = minifat[s]
            return b"".join(out)[:e[3]]
        return read_chain(e[2], e[3])

    compressed = bool(struct.unpack_from("<I", read("FileHeader"), 36)[0] & 1)
    texts: list[str] = []
    for name, _typ, _st, _sz in entries:
        if not name.startswith("Section"):
            continue
        body = read(name)
        if compressed:
            body = zlib.decompress(body, -15)
        i = 0
        while i + 4 <= len(body):
            hdr = struct.unpack_from("<I", body, i)[0]
            tag, size = hdr & 0x3FF, (hdr >> 20) & 0xFFF
            i += 4
            if size == 0xFFF:
                size = struct.unpack_from("<I", body, i)[0]; i += 4
            if tag == 67:  # HWPTAG_PARA_TEXT
                j = 0
                while j + 2 <= size:
                    c = struct.unpack_from("<H", body, i + j)[0]
                    if c in _HWP_EXT_CTRL:
                        j += 16
                        continue
                    if c < 32:
                        if c in (10, 13):
                            texts.append("\n")
                        j += 2
                        continue
                    texts.append(chr(c)); j += 2
                texts.append("\n")
            i += size
    return "".join(texts)


def extract_file_text(name: str, data: bytes) -> str:
    """업로드 참고 파일 → 텍스트. 실패해도 예외 대신 '[실패 사유]' 문자열을 돌려줘
    나머지 파일·생성 흐름은 계속되게 한다."""
    ext = os.path.splitext(name)[1].lower()
    try:
        if ext in (".txt", ".md", ".csv"):
            for enc in ("utf-8-sig", "cp949"):
                try:
                    return data.decode(enc)
                except UnicodeDecodeError:
                    pass
            return data.decode("utf-8", "ignore")
        if ext == ".hwpx":
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                texts = []
                for n in z.namelist():
                    if n.startswith("Contents/section") and n.endswith(".xml"):
                        xml = z.read(n).decode("utf-8")
                        texts += [t for t in re.findall(r"<hp:t>([^<]*)</hp:t>", xml) if t.strip()]
                return "\n".join(texts)
        if ext == ".docx":
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                xml = z.read("word/document.xml").decode("utf-8")
            xml = re.sub(r"</w:p>", "\n", xml)
            return re.sub(r"<[^>]+>", "", xml)
        if ext == ".hwp":
            return hwp_text(data)
        return "[지원하지 않는 형식: %s]" % ext
    except Exception as ex:
        return "[텍스트 추출 실패(%s): %s]" % (type(ex).__name__, ex)
