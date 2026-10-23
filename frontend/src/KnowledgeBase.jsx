
import { useEffect, useRef, useState } from "react";
import "./KnowledgeBase.css";

const API_URL = "http://127.0.0.1:8000";

export default function KnowledgeBase({ sessionId = "" }) {
  const fileInput = useRef(null);

  const [files, setFiles] = useState([]);
  const [chunkCount, setChunkCount] = useState(null);
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function refreshStatus() {
    try {
      const response = await fetch(
        `${API_URL}/knowledge-base/status`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error("Could not load knowledge-base status.");
      }

      setChunkCount(data.stored_chunks);
    } catch {
      setChunkCount(null);
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function handleUpload(event) {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";

    if (!selectedFiles.length) return;

    const invalidFile = selectedFiles.find(
      (file) => !file.name.toLowerCase().endsWith(".pdf")
    );

    if (invalidFile) {
      setError("Only PDF files are accepted. Please select a PDF.");
      setMessage("");
      return;
    }

    const oversizedFile = selectedFiles.find(
      (file) => file.size > 20 * 1024 * 1024
    );

    if (oversizedFile) {
      setError("Each PDF must be 20 MB or smaller.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    let uploaded = 0;

    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
          `${API_URL}/knowledge-base/upload`,
          {
            method: "POST",
            body: formData,
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            `${file.name}: ${data.detail || "Upload failed."}`
          );
        }

        uploaded += 1;

        setFiles((current) => [
          {
            name: data.filename || file.name,
            chunks: data.chunks_stored ?? 0,
            status: "Uploaded",
          },
          ...current.filter(
            (item) => item.name !== (data.filename || file.name)
          ),
        ]);
      }

      await refreshStatus();

      setMessage(
        `${uploaded} PDF file${uploaded === 1 ? "" : "s"} uploaded and processed successfully.`
      );
    } catch (err) {
      setError(err.message || "An error occurred while uploading.");
      await refreshStatus();
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setAnswer("");
    setResults([]);

    if (!query.trim()) {
      setError("Enter a customer message before searching.");
      return;
    }

    setSearching(true);

    try {
      const isManualSession = Boolean(sessionId);

      const endpoint = isManualSession
        ? `/sessions/${encodeURIComponent(sessionId)}/manual-answer`
        : "/knowledge-base/search";

      const body = isManualSession
        ? { question: query.trim() }
        : { query: query.trim(), top_k: 3 };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Knowledge search failed.");
      }

      setResults(data.results || []);
      setAnswer(data.answer || "");

      if (!data.results?.length) {
        setMessage(
          "No relevant chunks found. Try another customer message."
        );
      } else if (isManualSession) {
        setMessage("Your question and answer have been saved to the session.");
      }
    } catch (err) {
      setError(
        `${err.message} Make sure the backend is running and connected.`
      );
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="kb-page" id="knowledge">
      <div className="kb-heading">
        <div>
          <div className="kb-eyebrow">SUPPORT RESOURCES</div>
          <h1>Knowledge base</h1>
          <p>
            Upload support documents and retrieve relevant information.
          </p>
          {sessionId && (
            <p>
              <strong>Active Manual session:</strong>{" "}
              {sessionId}
            </p>
          )}
        </div>

        <button
          className="kb-button kb-primary"
          onClick={refreshStatus}
          type="button"
        >
          ↻ Refresh status
        </button>
      </div>

      <section className="kb-panel">
        <div className="kb-section-title">
          <span className="kb-section-icon">01</span>
          <div>
            <h2>Upload support documents</h2>
            <p>Choose FAQ, support guide, or policy PDF files.</p>
          </div>
        </div>

        <button
          className="kb-dropzone"
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={loading}
        >
          <span className="kb-upload-icon">↑</span>
          <strong>
            {loading ? "Processing documents..." : "Choose PDF files"}
          </strong>
          <span>Click to browse · PDF format · Maximum 20 MB per file</span>
          <span className="kb-browse">Browse files</span>
        </button>

        <input
          ref={fileInput}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          hidden
          onChange={handleUpload}
        />

        {files.length > 0 && (
          <div className="kb-file-list">
            <h3>Uploaded in this visit</h3>

            {files.map((file) => (
              <div className="kb-file-row" key={file.name}>
                <span className="kb-pdf-icon">PDF</span>

                <div className="kb-file-info">
                  <strong>{file.name}</strong>
                  <span>{file.chunks} chunks added</span>
                </div>

                <span className="kb-status">{file.status}</span>
              </div>
            ))}
          </div>
        )}

        <div className="kb-count-card">
          <div>
            <span className="kb-count-label">TOTAL STORED CHUNKS</span>
            <div className="kb-count">
              {chunkCount === null ? "—" : chunkCount}
            </div>
            <span className="kb-count-note">
              {chunkCount === null
                ? "Backend status unavailable"
                : "Chunks currently stored in the knowledge base"}
            </span>
          </div>

          <span className="kb-database-icon">▤</span>
        </div>
      </section>

      <section className="kb-panel">
        <div className="kb-section-title">
          <span className="kb-section-icon">02</span>
          <div>
            <h2>
              {sessionId
                ? "Manual customer message"
                : "Test knowledge retrieval"}
            </h2>
            <p>
              {sessionId
                ? "Submit a customer message for this saved Manual session."
                : "Search uploaded documents using a customer message."}
            </p>
          </div>
        </div>

        <form className="kb-search-form" onSubmit={handleSearch}>
          <label htmlFor="customer-query">Customer message</label>

          <textarea
            id="customer-query"
            rows={3}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Example: My order is delayed. How can I get an update?"
            maxLength={5000}
          />

          <button
            className="kb-button kb-primary"
            type="submit"
            disabled={searching}
          >
            {searching
              ? "Searching..."
              : sessionId
              ? "Submit customer message →"
              : "Find relevant chunks →"}
          </button>
        </form>

        {answer && (
          <div className="kb-result-card">
            <div className="kb-results-heading">
              <h3>Generated answer</h3>
            </div>
            <p>{answer}</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="kb-results">
            <div className="kb-results-heading">
              <h3>Retrieved knowledge</h3>
              <span>Top {results.length} results</span>
            </div>

            {results.map((item, index) => (
              <article
                className="kb-result-card"
                key={`${item.filename || item.source}-${item.chunk_index ?? index}-${index}`}
              >
                <div className="kb-result-top">
                  <span className="kb-result-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <strong>
                    {item.filename || item.source || "Unknown source"}
                  </strong>

                  {item.chunk_index !== undefined && (
                    <span className="kb-chunk-index">
                      Chunk {item.chunk_index}
                    </span>
                  )}
                </div>

                <p>
                  {item.text ||
                    item.content ||
                    "No chunk text returned."}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="kb-feedback kb-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {message && (
        <div className="kb-feedback kb-success" role="status">
          ✓ {message}
        </div>
      )}
    </div>
  );
}
