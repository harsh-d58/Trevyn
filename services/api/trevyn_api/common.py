"""Shared API helpers: problem+json errors and lookups by uuid or display id."""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class Problem(HTTPException):
    def __init__(self, status: int, type_: str, detail: str):
        super().__init__(status, detail)
        self.type_ = type_


async def get_or_404(s: AsyncSession, model, key: str):
    obj = await s.get(model, key)
    if not obj and hasattr(model, "display_id"):
        obj = await s.scalar(select(model).where(model.display_id == key))
    if not obj:
        raise Problem(404, "not_found", f"{model.__name__} {key} not found")
    return obj
