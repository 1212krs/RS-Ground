"""Shared security helpers for the FastAPI backend."""

from __future__ import annotations

import os
from typing import Iterable

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


MAX_REQUEST_BYTES = int(os.environ.get("RSG_MAX_REQUEST_BYTES", 12 * 1024 * 1024))
MAX_RAG_UPLOAD_BYTES = int(os.environ.get("RSG_MAX_RAG_UPLOAD_BYTES", 10 * 1024 * 1024))
MAX_REPORT_UPLOAD_BYTES = int(os.environ.get("RSG_MAX_REPORT_UPLOAD_BYTES", 5 * 1024 * 1024))
MAX_STORE_BYTES = int(os.environ.get("RSG_MAX_STORE_BYTES", 200 * 1024))


def csv_env(name: str) -> list[str]:
    return [v.strip() for v in os.environ.get(name, "").split(",") if v.strip()]


def allowed_hosts() -> list[str]:
    hosts = csv_env("RSG_ALLOWED_HOSTS")
    if hosts:
        return hosts
    return ["127.0.0.1", "localhost", "testserver"]


def require_max_len(value: str, field: str, limit: int) -> str:
    if len(value) > limit:
        raise HTTPException(status_code=400, detail=f"{field} is too long. Max {limit} characters.")
    return value


def require_json_size(data: object, field: str, limit: int = MAX_STORE_BYTES) -> None:
    import json

    size = len(json.dumps(data, ensure_ascii=False).encode("utf-8"))
    if size > limit:
        raise HTTPException(status_code=413, detail=f"{field} is too large. Max {limit} bytes.")


def clamp_int(value: object, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


async def read_upload_limited(file, limit: int) -> bytes:
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"File is too large. Max {limit} bytes.")
    return data


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject oversized requests before handlers read the body."""

    def __init__(self, app, max_bytes: int = MAX_REQUEST_BYTES):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        header = request.headers.get("content-length")
        if header:
            try:
                if int(header) > self.max_bytes:
                    return Response("Request body too large", status_code=413)
            except ValueError:
                return Response("Invalid Content-Length", status_code=400)
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add conservative browser security headers to API responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Cache-Control", "no-store")
        if request.url.scheme == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


def ensure_no_wildcard(values: Iterable[str], setting_name: str) -> None:
    if "*" in values:
        raise RuntimeError(f"{setting_name} must not contain '*' when credentials are enabled.")
