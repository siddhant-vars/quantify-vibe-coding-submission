# AI Chat Assistant

React + FastAPI + MongoDB chat app with live streaming, saved history and a Tone Toggle.

## Features
- Chat UI with distinct user/AI bubbles and auto-scroll
- Streaming replies (SSE from FastAPI, character-by-character reveal in React)
- History sidebar: past threads, search, open, delete
- MongoDB persistence: each conversation stores messages with timestamp, role, prompt/response and tone
- **Tone Toggle** (Professional / Casual / Concise): sent with every request; the backend appends it to the
  system instruction (`backend/app/llm.py`), so the very next reply changes style
- **Extra 1: Stop and Regenerate** - cancel a reply mid-stream (partial text is saved) or regenerate the last
  answer, e.g. after switching tone
- **Extra 2: Markdown rendering + code copy + Export** - tables, lists and code blocks render properly with
  one-click copy; any conversation can be downloaded as `.md`
- Works with Claude (default) or OpenAI via `LLM_PROVIDER`

## Run it
```bash
# 1. MongoDB
docker compose up -d

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # add your API key
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

## API
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/chat/stream` | `{conversation_id?, message, tone, regenerate}` -> SSE (`meta`, `delta`, `done`, `error`) |
| GET | `/api/conversations?q=` | List / search threads |
| GET | `/api/conversations/{id}` | Full thread |
| PATCH | `/api/conversations/{id}` | Rename |
| DELETE | `/api/conversations/{id}` | Delete |
| GET | `/api/conversations/{id}/export` | Markdown download |

## Mongo document
```json
{ "_id": "...", "title": "...", "created_at": "...", "updated_at": "...",
  "messages": [ { "role": "user|assistant", "content": "...", "timestamp": "...", "tone": "casual" } ] }
```
