import asyncio
import json
import re
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from .config import settings
from .llm import Tone, stream_reply

mongo = AsyncIOMotorClient(settings.mongo_uri, tz_aware=True)
convos = mongo[settings.mongo_db].conversations

app = FastAPI(title="AI Chat Assistant")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def ensure_indexes():
    await convos.create_index([("updated_at", -1)])


# ---------- helpers ----------
def now() -> datetime:
    return datetime.now(timezone.utc)


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(404, "Conversation not found")


def out_message(m: dict) -> dict:
    return {**m, "timestamp": m["timestamp"].isoformat()}


def out_summary(c: dict) -> dict:
    return {"id": str(c["_id"]), "title": c["title"], "updated_at": c["updated_at"].isoformat()}


async def get_convo(conversation_id: str) -> dict:
    doc = await convos.find_one({"_id": oid(conversation_id)})
    if not doc:
        raise HTTPException(404, "Conversation not found")
    return doc


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def make_title(text: str) -> str:
    text = " ".join(text.split())
    return text if len(text) <= 48 else text[:47].rstrip() + "…"


# ---------- conversations ----------
@app.get("/api/conversations")
async def list_conversations(q: str = Query("", max_length=100)):
    filt = {}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        filt = {"$or": [{"title": rx}, {"messages.content": rx}]}
    cursor = convos.find(filt, {"title": 1, "updated_at": 1}).sort("updated_at", -1).limit(100)
    return [out_summary(c) async for c in cursor]


@app.get("/api/conversations/{conversation_id}")
async def read_conversation(conversation_id: str):
    c = await get_convo(conversation_id)
    return {**out_summary(c), "messages": [out_message(m) for m in c["messages"]]}


class RenameBody(BaseModel):
    title: str = Field(min_length=1, max_length=120)


@app.patch("/api/conversations/{conversation_id}")
async def rename_conversation(conversation_id: str, body: RenameBody):
    res = await convos.update_one({"_id": oid(conversation_id)}, {"$set": {"title": body.title.strip()}})
    if not res.matched_count:
        raise HTTPException(404, "Conversation not found")
    return {"ok": True}


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    res = await convos.delete_one({"_id": oid(conversation_id)})
    if not res.deleted_count:
        raise HTTPException(404, "Conversation not found")
    return {"ok": True}


@app.get("/api/conversations/{conversation_id}/export")
async def export_conversation(conversation_id: str):
    c = await get_convo(conversation_id)
    lines = [f"# {c['title']}", ""]
    for m in c["messages"]:
        who = "You" if m["role"] == "user" else "Assistant"
        stamp = m["timestamp"].strftime("%Y-%m-%d %H:%M UTC")
        lines += [f"**{who}** ({stamp})", "", m["content"], ""]
    slug = re.sub(r"[^a-z0-9]+", "-", c["title"].lower()).strip("-") or "chat"
    return PlainTextResponse(
        "\n".join(lines),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{slug}.md"'},
    )


# ---------- streaming chat ----------
class ChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str | None = Field(None, max_length=8000)
    tone: Tone = "professional"
    regenerate: bool = False


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    if req.conversation_id:
        convo = await get_convo(req.conversation_id)
    else:
        if req.regenerate or not (req.message or "").strip():
            raise HTTPException(400, "A message is required to start a conversation")
        t = now()
        convo = {"title": make_title(req.message), "created_at": t, "updated_at": t, "messages": []}
        convo["_id"] = (await convos.insert_one(convo)).inserted_id

    cid = convo["_id"]
    messages: list[dict] = convo["messages"]

    if req.regenerate:
        # Drop the last AI answer and ask again with the current tone.
        if messages and messages[-1]["role"] == "assistant":
            messages.pop()
            await convos.update_one({"_id": cid}, {"$set": {"messages": messages}})
        if not messages or messages[-1]["role"] != "user":
            raise HTTPException(400, "Nothing to regenerate")
    else:
        text = (req.message or "").strip()
        if not text:
            raise HTTPException(400, "Message is empty")
        user_msg = {"role": "user", "content": text, "timestamp": now(), "tone": req.tone}
        messages.append(user_msg)
        await convos.update_one({"_id": cid}, {"$push": {"messages": user_msg}, "$set": {"updated_at": now()}})

    history = [{"role": m["role"], "content": m["content"]} for m in messages]

    async def event_stream():
        parts: list[str] = []
        saved = False

        async def save():
            ai_msg = {"role": "assistant", "content": "".join(parts), "timestamp": now(), "tone": req.tone}
            await convos.update_one({"_id": cid}, {"$push": {"messages": ai_msg}, "$set": {"updated_at": now()}})

        yield sse({"type": "meta", "conversation_id": str(cid)})
        try:
            async for chunk in stream_reply(history, req.tone):
                parts.append(chunk)
                yield sse({"type": "delta", "text": chunk})
            await save()
            saved = True
            yield sse({"type": "done"})
        except asyncio.CancelledError:
            raise  # client pressed Stop / disconnected; partial text is saved below
        except Exception as exc:  # surface provider errors to the UI
            yield sse({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
        finally:
            if parts and not saved:
                await asyncio.shield(save())

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "provider": settings.provider}
