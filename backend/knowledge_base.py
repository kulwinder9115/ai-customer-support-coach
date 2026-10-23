from pathlib import Path
from uuid import uuid4
import re

import chromadb
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sentence_transformers import SentenceTransformer


# ---------- Configuration ----------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHROMA_DIR = PROJECT_ROOT / "chroma_db"

MAX_CHUNKS_PER_PDF = 5000
CHUNK_SIZE = 1500
CHUNK_OVERLAP = 400

MAX_RELEVANCE_DISTANCE = 1.0
MIN_LEXICAL_OVERLAP = 2

chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))

# Keep the original collection name for compatibility with existing data.
collection = chroma_client.get_or_create_collection(
    name="support_knowledge",
    metadata={"hnsw:space": "cosine"},
)

embedding_model = None


# ---------- Embeddings ----------

def get_embedding_model():
    global embedding_model

    if embedding_model is None:
        embedding_model = SentenceTransformer(
            "sentence-transformers/all-MiniLM-L6-v2"
        )

    return embedding_model


# ---------- PDF extraction ----------

def extract_text_from_pdf(pdf_path):
    try:
        reader = PdfReader(str(pdf_path), strict=True)

        if reader.is_encrypted:
            raise ValueError(
                "This PDF is password-protected. Upload an unlocked PDF."
            )

        pages = []

        for page in reader.pages:
            text = page.extract_text()

            if text and text.strip():
                pages.append(text.strip())

        return "\n".join(pages)

    except ValueError:
        raise
    except (PdfReadError, OSError) as exc:
        raise ValueError(
            "This PDF is damaged or cannot be read. Try another PDF."
        ) from exc
    except Exception as exc:
        raise ValueError(
            "Could not read this PDF. Please upload a valid text-based PDF."
        ) from exc


# ---------- Text chunking ----------

def split_into_chunks(
    text,
    chunk_size=CHUNK_SIZE,
    overlap=CHUNK_OVERLAP,
):
    if chunk_size < 1 or overlap < 0 or overlap >= chunk_size:
        raise ValueError("Invalid chunking configuration.")

    text = re.sub(r"\s+", " ", text).strip()

    if not text:
        return []

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end >= len(text):
            break

        start = end - overlap

    return chunks


# ---------- PDF ingestion ----------

def add_pdf_to_knowledge_base(pdf_path):
    pdf_path = Path(pdf_path)

    if not pdf_path.is_file() or pdf_path.suffix.lower() != ".pdf":
        raise ValueError("Please provide an existing PDF file.")

    text = extract_text_from_pdf(pdf_path)

    if len(text.strip()) < 20:
        raise ValueError(
            "No readable text was found. This may be a scanned PDF; "
            "use a text-based PDF for this milestone."
        )

    chunks = split_into_chunks(text)

    if not chunks:
        raise ValueError("No text chunks could be created.")

    if len(chunks) > MAX_CHUNKS_PER_PDF:
        raise ValueError(
            f"This PDF creates too many chunks. "
            f"Limit: {MAX_CHUNKS_PER_PDF}."
        )

    model = get_embedding_model()
    embeddings = model.encode(
        chunks,
        show_progress_bar=False,
        convert_to_numpy=True,
    ).tolist()

    source = pdf_path.name
    new_ids = [str(uuid4()) for _ in chunks]

    old_records = collection.get(
        where={"source": source},
        include=["metadatas"],
    )
    old_ids = old_records.get("ids", [])

    # Insert new chunks in batches before removing the old version.
    batch_size = 100

    try:
        for start in range(0, len(chunks), batch_size):
            end = min(start + batch_size, len(chunks))

            collection.add(
                ids=new_ids[start:end],
                documents=chunks[start:end],
                embeddings=embeddings[start:end],
                metadatas=[
                    {
                        "source": source,
                        "chunk_index": index,
                    }
                    for index in range(start, end)
                ],
            )

    except Exception:
        try:
            collection.delete(ids=new_ids)
        except Exception:
            pass
        raise

    if old_ids:
        collection.delete(ids=old_ids)

    return {
        "filename": source,
        "chunks_stored": len(chunks),
        "total_chunks_stored": collection.count(),
    }


# ---------- Relevance helpers ----------

STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been",
    "being", "i", "me", "my", "we", "our", "you", "your", "it",
    "its", "this", "that", "these", "those", "to", "of", "for",
    "in", "on", "at", "by", "with", "from", "and", "or", "but",
    "if", "then", "than", "as", "do", "does", "did", "have",
    "has", "had", "can", "could", "would", "should", "will",
    "please", "help", "want", "need", "got", "get", "received",
    "there", "here", "what", "which", "who", "how",
    "me", "about", "tell", "explain",
}

SYNONYMS = {
    "wrong": "incorrect",
    "mistake": "incorrect",
    "mistaken": "incorrect",
    "parcel": "delivery",
    "package": "delivery",
    "shipment": "ship",
    "shipping": "ship",
    "shipped": "ship",
    "bought": "order",
    "purchase": "order",
    "purchased": "order",
    "orders": "order",
    "refunds": "refund",
    "refunded": "refund",
    "refunding": "refund",
    "returns": "return",
    "returned": "return",
    "returning": "return",
    "replacement": "replace",
    "replacements": "replace",
    "cancelled": "cancel",
    "canceled": "cancel",
    "cancelling": "cancel",
    "canceling": "cancel",
    "cancellation": "cancel",
    "cancellations": "cancel",
    "packing": "pack",
    "packed": "pack",
    "carrier": "ship",
    "handoff": "ship",
    "fees": "fee",
    "orders": "order",
}

# Extra terms help retrieve relevant policy passages when a short
# question uses different words from the document.
QUERY_EXPANSIONS = {
    "cancel": {
        "cancellation", "order", "pack", "ship",
        "carrier", "fee", "pending", "eligible",
    },
    "refund": {
        "return", "payment", "money", "eligible",
    },
    "return": {
        "refund", "replacement", "eligible", "delivery",
    },
    "delivery": {
        "ship", "carrier", "tracking", "order",
    },
    "address": {
        "delivery", "ship", "carrier", "change",
    },
}


def _normalise_tokens(text):
    words = re.findall(r"[a-z0-9]+", text.lower())
    tokens = set()

    for word in words:
        if word in STOP_WORDS or len(word) < 2:
            continue

        word = SYNONYMS.get(word, word)
        tokens.add(word)

    return tokens


def _expanded_query_tokens(query):
    tokens = _normalise_tokens(query)
    expanded = set(tokens)

    for token in tokens:
        expanded.update(QUERY_EXPANSIONS.get(token, set()))

    return expanded


def _lexical_overlap(query, document):
    query_tokens = _normalise_tokens(query)
    expanded_tokens = _expanded_query_tokens(query)
    document_tokens = _normalise_tokens(document)

    if not query_tokens or not document_tokens:
        return 0, 0.0

    # Count original matches and expanded policy-term matches.
    original_overlap = query_tokens.intersection(document_tokens)
    expanded_overlap = expanded_tokens.intersection(document_tokens)

    overlap_count = max(
        len(original_overlap),
        len(expanded_overlap),
    )

    # Keep the ratio bounded between 0 and 1.
    overlap_ratio = min(
        1.0,
        overlap_count / max(len(query_tokens), 1),
    )

    return overlap_count, overlap_ratio


def _is_relevant(query, document, distance):
    if distance is None or distance > MAX_RELEVANCE_DISTANCE:
        return False

    original_tokens = _normalise_tokens(query)
    expanded_tokens = _expanded_query_tokens(query)
    document_tokens = _normalise_tokens(document)

    if not document_tokens:
        return False

    original_overlap = original_tokens.intersection(document_tokens)
    expanded_overlap = expanded_tokens.intersection(document_tokens)

    # Exact keyword matches remain the strongest lexical signal.
    if len(original_overlap) >= MIN_LEXICAL_OVERLAP:
        return True

    # Allow short policy questions to match passages using related
    # policy terms, such as packing, carrier handoff, and cancellation.
    if len(expanded_overlap) >= MIN_LEXICAL_OVERLAP:
        return True

    return False


# ---------- Knowledge-base search ----------

def search_knowledge_base(query, top_k=3):
    if not isinstance(query, str) or not query.strip():
        raise ValueError("Customer message cannot be empty.")

    if (
        not isinstance(top_k, int)
        or isinstance(top_k, bool)
        or not 1 <= top_k <= 10
    ):
        raise ValueError("top_k must be an integer between 1 and 10.")

    query = query.strip()
    total_chunks = collection.count()

    if total_chunks == 0:
        return []

    model = get_embedding_model()

    query_embedding = model.encode(
        query,
        show_progress_bar=False,
        convert_to_numpy=True,
    ).tolist()

    # Search a larger pool before applying relevance filtering.
    candidate_count = min(max(top_k * 20, 50), total_chunks)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=candidate_count,
        include=["documents", "metadatas", "distances"],
    )

    documents = results.get("documents") or [[]]
    metadatas = results.get("metadatas") or [[]]
    distances = results.get("distances") or [[]]

    result_documents = documents[0] if documents else []
    result_metadatas = metadatas[0] if metadatas else []
    result_distances = distances[0] if distances else []

    candidates = []

    for index, document in enumerate(result_documents):
        if not document:
            continue

        metadata = (
            result_metadatas[index]
            if index < len(result_metadatas)
            else {}
        ) or {}

        distance = (
            float(result_distances[index])
            if index < len(result_distances)
            and result_distances[index] is not None
            else None
        )

        overlap_count, overlap_ratio = _lexical_overlap(query, document)
        relevant = _is_relevant(query, document, distance)

        # Cosine distance is not a calibrated probability.
        relevance_score = (
            max(0.0, min(1.0, 1.0 - distance))
            if distance is not None
            else 0.0
        )

        candidates.append({
            "text": document,
            "source": metadata.get("source", "Unknown source"),
            "filename": metadata.get("source", "Unknown source"),
            "chunk_index": metadata.get("chunk_index", -1),
            "chunk_size": len(document),
            "distance": distance,
            "relevance": round(relevance_score, 4),
            "lexical_overlap": overlap_count,
            "lexical_overlap_ratio": round(overlap_ratio, 4),
            "is_relevant": relevant,
            "relevance_status": (
                "relevant" if relevant else "weak_match_check_policy"
            ),
        })

    relevant_candidates = [
        candidate for candidate in candidates
        if candidate["is_relevant"]
    ]

    # Prefer semantic similarity, then stronger keyword overlap.
    relevant_candidates.sort(
        key=lambda item: (
            item["distance"]
            if item["distance"] is not None
            else float("inf"),
            -item["lexical_overlap"],
        )
    )

    return relevant_candidates[:top_k]
