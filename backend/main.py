from contextlib import asynccontextmanager
from pathlib import Path
from backend.conversation_agent import generate_customer_message
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.answer_generator import generate_answer
from backend.knowledge_base import (
    add_pdf_to_knowledge_base,
    search_knowledge_base,
    collection,
)
from backend.session_store import (
    SessionCreate,
    SessionUpdate,
    create_session,
    get_session,
    list_sessions,
    update_session,
)


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = PROJECT_ROOT / "docs"
MAX_PDF_BYTES = 20 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="AI Coaching Assistant API",
    description="RAG knowledge base with Simulator, Manual, and Replay session modes.",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    errors = []
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", [])]
        field = ".".join(location[1:]) or "input"
        message = error.get("msg", "Invalid value.")
        errors.append({"field": field, "message": message})

    summary = errors[0]["message"] if errors else "Please check your input."

    return JSONResponse(
        status_code=422,
        content={
            "detail": f"Invalid input: {summary}",
            "errors": errors,
        },
    )


class SearchRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    query: str = Field(min_length=1, max_length=5000)
    top_k: int = Field(default=3, ge=1, le=3)

    @field_validator("query")
    @classmethod
    def query_must_not_be_blank(cls, value):
        if not value.strip():
            raise ValueError("Customer message cannot be empty.")
        return value


@app.get("/")
def home():
    return {"message": "AI Coaching Assistant API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/knowledge-base/status")
def knowledge_base_status():
    return {"stored_chunks": collection.count()}


@app.post("/knowledge-base/upload")
async def upload_and_ingest(file: UploadFile = File(...)):
    filename = Path(file.filename or "").name

    if not filename or filename in {".", ".."}:
        raise HTTPException(
            status_code=400,
            detail="Invalid filename. Choose a PDF file.",
        )

    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=415,
            detail="Invalid input: only PDF files are accepted.",
        )

    pdf_path = DOCS_DIR / filename

    try:
        content = await file.read(MAX_PDF_BYTES + 1)

        if not content:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty.",
            )

        if len(content) > MAX_PDF_BYTES:
            raise HTTPException(
                status_code=413,
                detail="PDF is too large. Maximum upload size is 20 MB.",
            )

        if not content.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=400,
                detail="Invalid input: this file does not appear to be a PDF.",
            )

        if pdf_path.exists():
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{filename} already exists. Rename the file before "
                    "uploading it again."
                ),
            )

        pdf_path.write_bytes(content)

        try:
            result = add_pdf_to_knowledge_base(pdf_path)
        except ValueError as exc:
            pdf_path.unlink(missing_ok=True)
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            pdf_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=500,
                detail="PDF ingestion failed. Check the backend logs and retry.",
            ) from exc

        return {
            "message": "PDF uploaded and ingested successfully.",
            **result,
        }

    finally:
        await file.close()


@app.post("/knowledge-base/ingest")
def ingest_existing_pdf(
    filename: str = Query(min_length=5, max_length=255),
):
    if Path(filename).name != filename or not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Provide a PDF filename stored in the docs folder.",
        )

    try:
        result = add_pdf_to_knowledge_base(DOCS_DIR / filename)
        return {
            "message": "PDF ingested successfully.",
            **result,
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="PDF ingestion failed. Check the backend logs.",
        ) from exc


@app.post("/knowledge-base/search")
def search_pdf(request: SearchRequest):
    try:
        results = search_knowledge_base(
            request.query,
            top_k=request.top_k,
        )
        return {
            "query": request.query,
            "results": results,
            "result_count": len(results),
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Knowledge-base search failed. Check the backend logs.",
        ) from exc


@app.post("/knowledge-base/ask")
def ask_question(request: SearchRequest):
    try:
        matches = search_knowledge_base(
            request.query,
            top_k=request.top_k,
        )

        result = generate_answer(request.query, matches)

        return {
    "query": request.query,
    "results": result["relevant_results"],
    "result_count": len(result["relevant_results"]),
    "answer": result["answer"],
    "sources": result["sources"],
}

    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Answer generation failed. Check the API configuration and logs.",
        ) from exc


# ---------- Saved session endpoints ----------

@app.post("/sessions", status_code=201)
def create_saved_session(request: SessionCreate):
    return create_session(request)


@app.get("/sessions")
def get_saved_sessions():
    return {"sessions": list_sessions()}


@app.get("/sessions/{session_id}")
def load_saved_session(session_id: str):
    session = get_session(session_id)

    if session is None:
        raise HTTPException(status_code=404, detail="Saved session not found.")

    return session


@app.patch("/sessions/{session_id}")
def update_saved_session(session_id: str, request: SessionUpdate):
    session = update_session(session_id, request)

    if session is None:
        raise HTTPException(status_code=404, detail="Saved session not found.")

    return session


class StartConversationRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    session_id: str = Field(min_length=1)


class CustomerReplyRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    session_id: str = Field(min_length=1)
    trainee_message: str = Field(min_length=1, max_length=5000)


class ManualAnswerRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    question: str = Field(min_length=1, max_length=5000)

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value):
        if not value.strip():
            raise ValueError("Question cannot be empty.")
        return value


@app.post("/sessions/{session_id}/manual-answer")
def answer_manual_session(session_id: str, request: ManualAnswerRequest):
    """Answer a manually entered customer question using the policy knowledge base."""
    session = get_session(session_id)

    if session is None:
        raise HTTPException(status_code=404, detail="Saved session not found.")

    if session["mode"] != "Manual":
        raise HTTPException(
            status_code=400,
            detail="Manual answers are only available in Manual mode.",
        )

    try:
        matches = search_knowledge_base(request.question, top_k=3)
        result = generate_answer(request.question, matches, history=session.get("conversation_history") or [])

        history = list(session.get("conversation_history") or [])
        history.extend([
            {"role": "customer", "content": request.question},
            {"role": "trainee", "content": result["answer"]},
        ])
        updated = update_session(
            session_id,
            SessionUpdate(
                customer_message=request.question,
                last_answer=result["answer"],
                retrieved_chunks=matches,
                conversation_history=history,
            ),
        )

        return {
    "session_id": session_id,
    "mode": "Manual",
    "question": request.question,
    "results": result["relevant_results"],
    "result_count": len(result["relevant_results"]),
    "answer": result["answer"],
    "sources": result["sources"],
    "session": updated,
}

    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Manual answer generation failed. Check the backend logs.",
        ) from exc


@app.get("/sessions/{session_id}/replay")
def replay_session(session_id: str):
    """Return saved session material for Replay mode without generating new dialogue."""
    session = get_session(session_id)

    if session is None:
        raise HTTPException(status_code=404, detail="Saved session not found.")

    if session["mode"] != "Replay":
        raise HTTPException(
            status_code=400,
            detail="Replay is only available for sessions created in Replay mode.",
        )

    history = session.get("conversation_history") or []
    if not history and not session.get("customer_message"):
        raise HTTPException(
            status_code=409,
            detail=(
                "This Replay session has no saved conversation yet. "
                "Create it with a customer message or conversation history."
            ),
        )

    return {
        "session_id": session_id,
        "mode": "Replay",
        "session_name": session["session_name"],
        "scenario": session["scenario"],
        "customer_message": session.get("customer_message", ""),
        "conversation_history": history,
        "last_answer": session.get("last_answer", ""),
        "retrieved_chunks": session.get("retrieved_chunks", []),
    }


@app.post("/conversation/start")
def start_conversation(request: StartConversationRequest):
    session = get_session(request.session_id)

    if session is None:
        raise HTTPException(status_code=404, detail="Saved session not found.")

    if session["mode"] != "Simulator":
        raise HTTPException(
            status_code=400,
            detail="Conversation can only start in Simulator mode.",
        )

    if session["conversation_history"]:
        raise HTTPException(
            status_code=409,
            detail="This session already has conversation history.",
        )

    try:
        customer_message = generate_customer_message(
            scenario=session["scenario"],
            persona=session["persona"],
            difficulty=session["difficulty"],
            history=[],
        )

        history = [
            {"role": "customer", "content": customer_message}
        ]

        update_session(
            session["id"],
            SessionUpdate(
                customer_message=customer_message,
                conversation_history=history,
            ),
        )

        return {
            "session_id": session["id"],
            "customer_message": customer_message,
            "conversation_history": history,
        }

    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not start the customer simulation. Check backend logs.",
        ) from exc


@app.post("/conversation/reply")
def reply_to_customer(request: CustomerReplyRequest):
    session = get_session(request.session_id)

    if session is None:
        raise HTTPException(status_code=404, detail="Saved session not found.")

    if session["mode"] != "Simulator":
        raise HTTPException(
            status_code=400,
            detail="Conversation replies are only available in Simulator mode.",
        )

    history = session["conversation_history"]

    if not history:
        raise HTTPException(
            status_code=409,
            detail="Start the conversation before sending a reply.",
        )

    try:
        updated_history = history + [
            {"role": "trainee", "content": request.trainee_message}
        ]

        customer_message = generate_customer_message(
            scenario=session["scenario"],
            persona=session["persona"],
            difficulty=session["difficulty"],
            history=updated_history,
        )

        updated_history.append({
            "role": "customer",
            "content": customer_message,
        })

        updated_session = update_session(
            session["id"],
            SessionUpdate(
                customer_message=customer_message,
                conversation_history=updated_history,
            ),
        )

        return {
            "session_id": session["id"],
            "trainee_message": request.trainee_message,
            "customer_message": customer_message,
            "conversation_history": updated_session["conversation_history"],
        }

    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not generate the customer's reply. Check backend logs.",
        ) from exc

