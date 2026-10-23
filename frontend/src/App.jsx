
import { useEffect, useState } from "react";
import KnowledgeBase from "./KnowledgeBase";
import IntroPage from "./IntroPage";
import "./index.css";

const API_URL = "http://127.0.0.1:8000";

const modes = [
  {
    id: "Simulator",
    icon: "🎭",
    title: "Simulator",
    description: "Practice with an AI-generated customer.",
  },
  {
    id: "Manual",
    icon: "💬",
    title: "Manual",
    description: "Enter a real or sample customer message.",
  },
  {
    id: "Replay",
    icon: "⏪",
    title: "Replay",
    description: "Review a previous support conversation.",
  },
];

const emptySession = {
  session_name: "",
  mode: "Simulator",
  product_context: "",
  scenario: "",
  persona: "Neutral",
  difficulty: "Medium",
};

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.detail || `Request failed (${response.status}).`
    );
  }

  return data;
}

function App() {
  const [session, setSession] = useState(emptySession);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savedSession, setSavedSession] = useState(null);

  const [activeSessionId, setActiveSessionId] = useState(
    () => localStorage.getItem("ai-support-active-session-id") || ""
  );

  const [activePage, setActivePage] = useState(() => {
    return localStorage.getItem("supportpilot-active-page") || "home";
  });

  const [saving, setSaving] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [savedSessions, setSavedSessions] = useState([]);
  const [selectedRestoreId, setSelectedRestoreId] = useState("");

  const [replayData, setReplayData] = useState(null);
  const [loadingReplay, setLoadingReplay] = useState(false);

  useEffect(() => {
    localStorage.setItem("supportpilot-active-page", activePage);
  }, [activePage]);

  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem(
        "ai-support-active-session-id",
        activeSessionId
      );
    } else {
      localStorage.removeItem("ai-support-active-session-id");
    }
  }, [activeSessionId]);

  // Restore the active session from SQLite after a browser refresh.
  useEffect(() => {
    async function reloadActiveSession() {
      if (!activeSessionId) return;

      try {
        const data = await apiRequest(
          `/sessions/${encodeURIComponent(activeSessionId)}`
        );

        setSavedSession(data);

        setSession((current) => ({
          ...current,
          session_name: data.session_name || "",
          mode: data.mode || "Simulator",
          scenario: data.scenario || "",
          persona: data.persona || "Neutral",
          difficulty: data.difficulty || "Medium",
        }));

        if (activePage === "replay") {
          setReplayData(data);
        }
      } catch {
        localStorage.removeItem("ai-support-active-session-id");
        setActiveSessionId("");
      }
    }

    reloadActiveSession();
  }, []);

  function updateField(event) {
    const { name, value } = event.target;

    setSession((current) => ({
      ...current,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  }

  // Replay opens the history page instead of selecting a new session mode.
  function chooseMode(mode) {
    setError("");
    setSuccess("");

    if (mode === "Replay") {
      setActivePage("replay");
      setReplayData(null);
      setSavedSessions([]);
      setSelectedRestoreId("");
      restoreSessionList();
      return;
    }

    setSession((current) => ({
      ...current,
      mode,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!session.session_name.trim()) {
      setError("Please enter a session name.");
      return;
    }

    if (!session.product_context.trim()) {
      setError("Please enter the product context.");
      return;
    }

    if (!session.scenario.trim()) {
      setError("Please describe the customer scenario.");
      return;
    }

    const combinedScenario =
      `Product context: ${session.product_context.trim()}\n` +
      `Customer scenario: ${session.scenario.trim()}`;

    if (combinedScenario.length > 500) {
      setError(
        "Product context and scenario must fit within 500 characters combined."
      );
      return;
    }

    const payload = {
      session_name: session.session_name.trim(),
      mode: session.mode,
      scenario: combinedScenario,
      persona: session.persona,
      difficulty: session.difficulty,
      customer_message: "",
      conversation_history: [],
      retrieved_chunks: [],
    };

    setSaving(true);

    try {
      const created = await apiRequest("/sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSavedSession(created);
      setActiveSessionId(created.id);

      setSession((current) => ({
        ...current,
        session_name: created.session_name,
      }));

      setSuccess("Session saved successfully in SQLite.");

      if (created.mode === "Manual") {
        setActivePage("knowledge");
      }
    } catch (err) {
      setError(err.message || "Unable to save the session.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreSessionList() {
    setError("");
    setSuccess("");
    setLoadingSessions(true);

    try {
      const data = await apiRequest("/sessions");
      const sessions = data.sessions || [];

      setSavedSessions(sessions);

      if (sessions.length === 0) {
        setSelectedRestoreId("");
        setReplayData(null);
        setError("No saved sessions were found in SQLite.");
        return;
      }

      const preferredId =
        sessions.find((item) => item.id === activeSessionId)?.id ||
        sessions[0].id;

      setSelectedRestoreId(preferredId);

      setSuccess(
        `${sessions.length} saved session(s) loaded. Select one to continue.`
      );
    } catch (err) {
      setError(err.message || "Unable to load saved sessions.");
    } finally {
      setLoadingSessions(false);
    }
  }

  async function loadSelectedSession() {
    if (!selectedRestoreId) {
      setError("Select a saved session first.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      const data = await apiRequest(
        `/sessions/${encodeURIComponent(selectedRestoreId)}`
      );

      setSavedSession(data);
      setActiveSessionId(data.id);

      const rawScenario = data.scenario || "";
      const productMatch = rawScenario.match(
        /^Product context: ([\s\S]*?)\nCustomer scenario: ([\s\S]*)$/
      );

      setSession({
        session_name: data.session_name || "",
        mode: data.mode || "Simulator",
        product_context: productMatch ? productMatch[1] : "",
        scenario: productMatch ? productMatch[2] : rawScenario,
        persona: data.persona || "Neutral",
        difficulty: data.difficulty || "Medium",
      });

      setSuccess(`Restored "${data.session_name}" from SQLite.`);

      if (data.mode === "Manual") {
        setActivePage("knowledge");
      } else {
        setActivePage("setup");
      }
    } catch (err) {
      setError(err.message || "Unable to restore the selected session.");
    }
  }

  async function loadReplaySession() {
    if (!selectedRestoreId) {
      setError("Select a saved session first.");
      return;
    }

    setError("");
    setSuccess("");
    setLoadingReplay(true);
    setReplayData(null);

    try {
      const data = await apiRequest(
        `/sessions/${encodeURIComponent(selectedRestoreId)}`
      );

      setReplayData(data);
      setActiveSessionId(data.id);
      setSuccess(`Loaded "${data.session_name}" for review.`);
    } catch (err) {
      setError(err.message || "Unable to load this replay.");
    } finally {
      setLoadingReplay(false);
    }
  }

  function openReplayPage() {
    setError("");
    setSuccess("");
    setReplayData(null);
    setSavedSessions([]);
    setSelectedRestoreId("");
    setActivePage("replay");
    restoreSessionList();
  }

  function clearForm() {
    setSession(emptySession);
    setSavedSession(null);
    setActiveSessionId("");
    setError("");
    setSuccess("");
    setSavedSessions([]);
    setSelectedRestoreId("");
    setReplayData(null);
  }

  if (activePage === "home") {
    return (
      <IntroPage onGetStarted={() => setActivePage("setup")} />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            setActivePage("home");
          }}
        >
          <span className="brand-icon">✳</span>
          <span>
            <strong>SupportAssistant</strong>
          </span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>

        <button
          className={`nav-item ${
            activePage === "setup" ? "active" : ""
          }`}
          onClick={() => setActivePage("setup")}
        >
          Session setup
        </button>

        <button
          className={`nav-item ${
            activePage === "knowledge" ? "active" : ""
          }`}
          onClick={() => setActivePage("knowledge")}
        >
          Knowledge base
        </button>

        <button
          className={`nav-item ${
            activePage === "replay" ? "active" : ""
          }`}
          onClick={openReplayPage}
        >
          ⏪ Replay
        </button>
      </aside>

      <main className="main-area" id="home">
        {activePage === "setup" ? (
          <div className="page-content" id="setup">
            <div className="page-heading">
              <div>
                <div className="eyebrow">GET STARTED</div>
                <h1>Configure your session</h1>
                <p>Set up a support scenario.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <section className="panel">
                <div className="section-heading">
                  <div className="section-icon">01</div>
                  <div>
                    <h2>Choose interaction mode</h2>
                    <p>How would you like to run this session?</p>
                  </div>
                </div>

                <div className="mode-grid">
                  {modes.map((mode) => (
                    <button
                      type="button"
                      key={mode.id}
                      className={`mode-card ${
                        session.mode === mode.id ? "selected" : ""
                      }`}
                      onClick={() => chooseMode(mode.id)}
                      aria-pressed={
                        mode.id === "Replay"
                          ? activePage === "replay"
                          : session.mode === mode.id &&
                            activePage === "setup"
                      }
                    >
                      <div className="mode-card-top">
                        <span className="mode-icon">{mode.icon}</span>
                        <span className="radio-indicator">
                          {mode.id !== "Replay" &&
                          session.mode === mode.id
                            ? "✓"
                            : mode.id === "Replay" &&
                              activePage === "replay"
                            ? "✓"
                            : ""}
                        </span>
                      </div>
                      <strong>{mode.title}</strong>
                      <span className="mode-description">
                        {mode.description}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="section-heading">
                  <div className="section-icon">02</div>
                  <div>
                    <h2>Session details</h2>
                    <p>Give your coaching session some context.</p>
                  </div>
                </div>

                <div className="form-grid">
                  <label className="field full-width">
                    <span>Session name <b>*</b></span>
                    <input
                      name="session_name"
                      value={session.session_name}
                      onChange={updateField}
                      maxLength={80}
                      placeholder="e.g. Delayed Order Support"
                    />
                  </label>

                  <label className="field full-width">
                    <span>Product context <b>*</b></span>
                    <textarea
                      name="product_context"
                      value={session.product_context}
                      onChange={updateField}
                      placeholder="Describe the product or service..."
                      rows={3}
                    />
                    <small>
                      Example: An online shopping platform with order tracking
                      and refunds.
                    </small>
                  </label>

                  <label className="field full-width">
                    <span>Customer scenario <b>*</b></span>
                    <textarea
                      name="scenario"
                      value={session.scenario}
                      onChange={updateField}
                      placeholder="What happened, and what does the customer need?"
                      rows={4}
                    />
                    <small>
                      Example: The customer's delivery is three days late.
                    </small>
                  </label>

                  <label className="field">
                    <span>Customer persona</span>
                    <select
                      name="persona"
                      value={session.persona}
                      onChange={updateField}
                    >
                      <option value="Neutral">Neutral</option>
                      <option value="Friendly">Friendly</option>
                      <option value="Impatient">Impatient</option>
                      <option value="Frustrated">Frustrated</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>Difficulty level</span>
                    <select
                      name="difficulty"
                      value={session.difficulty}
                      onChange={updateField}
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </label>
                </div>
              </section>

              {error && (
                <div className="feedback error" role="alert">
                  <span>⚠</span> {error}
                </div>
              )}

              {success && (
                <div className="feedback success" role="status">
                  <span>✓</span> {success}
                </div>
              )}

              <div className="form-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={clearForm}
                >
                  Clear form
                </button>

                <button
                  className="button secondary"
                  type="button"
                  onClick={restoreSessionList}
                  disabled={loadingSessions}
                >
                  {loadingSessions
                    ? "Loading sessions..."
                    : "↻ Restore saved sessions"}
                </button>

                <button
                  className="button primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : session.mode === "Manual"
                    ? "Save & open Knowledge Base"
                    : "Save session"}
                  {!saving && <span> →</span>}
                </button>
              </div>
            </form>

            {savedSessions.length > 0 && (
              <section className="panel">
                <div className="section-heading">
                  <div className="section-icon">03</div>
                  <div>
                    <h2>Restore a saved session</h2>
                    <p>Choose a session stored in SQLite.</p>
                  </div>
                </div>

                <label className="field full-width">
                  <span>Saved sessions</span>
                  <select
                    value={selectedRestoreId}
                    onChange={(event) =>
                      setSelectedRestoreId(event.target.value)
                    }
                  >
                    {savedSessions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.session_name} — {item.mode}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="button primary"
                  type="button"
                  onClick={loadSelectedSession}
                >
                  Load selected session →
                </button>
              </section>
            )}

            {savedSession && (
              <section className="session-confirmation">
                <div className="confirmation-header">
                  <span className="confirmation-check">✓</span>
                  <div>
                    <span className="confirmation-eyebrow">
                      SESSION SAVED
                    </span>
                    <h2>{savedSession.session_name}</h2>
                    <p>Saved in SQLite. ID: {savedSession.id}</p>
                  </div>
                </div>

                <div className="confirmation-details">
                  <div>
                    <span>INTERACTION MODE</span>
                    <strong>{savedSession.mode}</strong>
                  </div>
                  <div>
                    <span>CUSTOMER SCENARIO</span>
                    <strong>{session.scenario}</strong>
                  </div>
                  <div>
                    <span>DIFFICULTY</span>
                    <strong>{savedSession.difficulty}</strong>
                  </div>
                </div>

                {savedSession.mode === "Manual" && (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => setActivePage("knowledge")}
                  >
                    Continue to Knowledge Base →
                  </button>
                )}

                {savedSession.mode !== "Manual" && (
                  <p>
                    This session is saved. Its interaction screen must be
                    connected separately.
                  </p>
                )}
              </section>
            )}

            <footer>
              <span>
                SupportAssistant · AI Customer Support Coaching Assistant
              </span>
            </footer>
          </div>
        ) : activePage === "knowledge" ? (
          <KnowledgeBase sessionId={activeSessionId} />
        ) : (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">REVIEW</div>
                <h1>Replay a support conversation</h1>
                <p>
                  Load a saved session to review its conversation history.
                </p>
              </div>
            </div>

            <section className="panel">
              <div className="section-heading">
                <div className="section-icon">01</div>
                <div>
                  <h2>Choose a saved session</h2>
                  <p>Sessions are retrieved from your backend database.</p>
                </div>
              </div>

              <button
                className="button secondary"
                type="button"
                onClick={restoreSessionList}
                disabled={loadingSessions}
              >
                {loadingSessions
                  ? "Loading sessions..."
                  : "↻ Load saved sessions"}
              </button>

              {savedSessions.length > 0 && (
                <>
                  <label className="field full-width">
                    <span>Saved sessions</span>
                    <select
                      value={selectedRestoreId}
                      onChange={(event) => {
                        setSelectedRestoreId(event.target.value);
                        setReplayData(null);
                        setError("");
                        setSuccess("");
                      }}
                    >
                      {savedSessions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.session_name} — {item.mode}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    className="button primary"
                    type="button"
                    onClick={loadReplaySession}
                    disabled={loadingReplay}
                  >
                    {loadingReplay ? "Loading replay..." : "Load replay →"}
                  </button>
                </>
              )}

              {error && (
                <div className="feedback error" role="alert">
                  ⚠ {error}
                </div>
              )}

              {success && (
                <div className="feedback success" role="status">
                  ✓ {success}
                </div>
              )}
            </section>

            {replayData && (
              <section className="panel">
                <div className="section-heading">
                  <div className="section-icon">02</div>
                  <div>
                    <h2>{replayData.session_name || "Saved session"}</h2>
                    <p>
                      Mode: {replayData.mode || "Unknown"} · Session ID:{" "}
                      {replayData.id}
                    </p>
                  </div>
                </div>

                <div className="confirmation-details">
                  <div>
                    <span>SCENARIO</span>
                    <strong>
                      {replayData.scenario || "No scenario saved."}
                    </strong>
                  </div>
                  <div>
                    <span>PERSONA</span>
                    <strong>{replayData.persona || "Not specified"}</strong>
                  </div>
                  <div>
                    <span>DIFFICULTY</span>
                    <strong>
                      {replayData.difficulty || "Not specified"}
                    </strong>
                  </div>
                </div>

                <h3>Conversation history</h3>

                {Array.isArray(replayData.conversation_history) &&
                replayData.conversation_history.length > 0 ? (
                  <div className="replay-history">
                    {replayData.conversation_history.map((message, index) => {
                      const role =
                        typeof message === "object" && message !== null
                          ? message.role || message.sender || "Message"
                          : "Message";

                      const content =
                        typeof message === "string"
                          ? message
                          : message.content ??
                            message.message ??
                            JSON.stringify(message, null, 2);

                      return (
                        <div className="panel" key={index}>
                          <strong>{role}</strong>
                          <p style={{ whiteSpace: "pre-wrap" }}>
                            {String(content)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p>
                    No conversation messages were saved for this session.
                    The session details are available above, but there is
                    no recorded conversation to replay yet.
                  </p>
                )}

                {replayData.customer_message && (
                  <>
                    <h3>Saved customer message</h3>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {replayData.customer_message}
                    </p>
                  </>
                )}
              </section>
            )}

            <footer>
              <span>
                SupportAssistant · AI Customer Support Coaching Assistant
              </span>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
