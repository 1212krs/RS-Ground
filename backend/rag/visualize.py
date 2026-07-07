"""임베딩 공간을 UMAP으로 2차원 축소한 뒤 Plotly 인터랙티브 산점도로 그린다.

PRD-RAG.md 4.4절: random_state 고정(재현 가능한 그림), metric="cosine"(검색과 동일 거리 방식),
좌표는 파일로 캐시해서 시각화 스타일만 바꿀 때 UMAP을 재계산하지 않는다.

해석 주의: UMAP은 이웃 관계(뭉침)는 보존하지만 클러스터 간 거리·크기는 왜곡한다.
"같은 주제끼리 뭉치는가"를 보는 진단 도구이지, 2D 거리로 유사도를 판정하는 도구가 아니다.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import plotly.graph_objects as go
import umap

from . import config


def compute_umap_coords(
    vectors: list[list[float]],
    random_state: int = 42,
    metric: str = "cosine",
) -> np.ndarray:
    n_neighbors = min(15, max(2, len(vectors) - 1))
    reducer = umap.UMAP(
        n_neighbors=n_neighbors,
        min_dist=0.1,
        metric=metric,
        random_state=random_state,
    )
    return reducer.fit_transform(np.array(vectors))


def save_coords(coords: np.ndarray, metadatas: list[dict], out_path: Path = config.UMAP_COORDS_PATH) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = [
        {"x": float(x), "y": float(y), **meta}
        for (x, y), meta in zip(coords, metadatas)
    ]
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_coords(path: Path = config.UMAP_COORDS_PATH) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_scatter_html(points: list[dict], out_path: Path = config.VISUALIZATION_PATH) -> None:
    sources = sorted({p["source"] for p in points})
    fig = go.Figure()

    for source in sources:
        subset = [p for p in points if p["source"] == source]
        fig.add_trace(
            go.Scatter(
                x=[p["x"] for p in subset],
                y=[p["y"] for p in subset],
                mode="markers",
                name=source,
                text=[
                    f"[{p['source']}] #{p['chunk_index']}<br>{p['text_preview']}"
                    for p in subset
                ],
                hoverinfo="text",
                marker={"size": 8},
            )
        )

    fig.update_layout(
        title="문서 임베딩 지도 (UMAP 2D, 색상=출처 파일)",
        xaxis_title="UMAP-1",
        yaxis_title="UMAP-2",
        legend_title="출처 파일",
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.write_html(str(out_path))
