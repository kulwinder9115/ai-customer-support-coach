
import { useEffect, useState } from "react";
import KnowledgeBase from "./KnowledgeBase";
import IntroPage from "./IntroPage";
import "./index.css";

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
  mode: "Manual",
  product_context: "",
  scenario: "",
  persona: "Neutral",
  difficulty: "Medium",
};

function App() {
  const [session, setSession] = useState(emptySession);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savedSession, setSavedSession] = useState(null);
  const [activePage, setActivePage] = useState(() => {
       return localStorage.getItem("supportpilot-active-page") || "home";
  });

  useEffect(() => {
      localStorage.setItem("supportpilot-active-page", activePage);
  }, [activePage]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai-support-coach-session");

      if (saved) {
        const parsed = JSON.parse(saved);
        setSession({ ...emptySession, ...parsed });
        setSavedSession(parsed);
      }
    } catch {
      localStorage.removeItem("ai-support-coach-session");
    }
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

  function chooseMode(mode) {
    setSession((current) => ({ ...current, mode }));
    setError("");
    setSuccess("");
  }

  function handleSubmit(event) {
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

    const sessionToSave = {
      ...session,
      session_name: session.session_name.trim(),
      product_context: session.product_context.trim(),
      scenario: session.scenario.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      localStorage.setItem(
        "ai-support-coach-session",
        JSON.stringify(sessionToSave)
      );

      setSession(sessionToSave);
      setSavedSession(sessionToSave);
      setSuccess(
        "Your session is saved and ready to review."
      );
    } catch {
      setError("Unable to save the session in this browser.");
    }
  }

  function restoreSession() {
    try {
      const saved = localStorage.getItem("ai-support-coach-session");

      if (!saved) {
        setError("No saved session was found.");
        return;
      }

      setSession({ ...emptySession, ...JSON.parse(saved) });
      setSavedSession(JSON.parse(saved));
      setError("");
      setSuccess("Your saved session has been restored.");
    } catch {
      setError("Unable to restore the saved session.");
    }
  }

  function clearForm() {
    setSession(emptySession);
    setError("");
    setSuccess("");
  }
 if (activePage === "home") {
  return (
    <IntroPage
      onGetStarted={() => setActivePage("setup")}
    />
  );
}
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home">
          <span className="brand-icon">✳</span>
          <span>
            <strong>SupportAssistant</strong>
          </span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>

       <button
             className={`nav-item ${activePage === "setup" ? "active" : ""}`}
             onClick={() => setActivePage("setup")}
       >
           Session setup
      </button>

        <button
            className={`nav-item ${activePage === "knowledge" ? "active" : ""}`}
            onClick={() => setActivePage("knowledge")}
        >
              Knowledge base
        </button>
      </aside>

      <main className="main-area" id="home">
        

        {activePage === "setup" ? (
          <div className="page-content" id="setup">
          <div className="page-heading">
            <div>
              <div className="eyebrow">GET STARTED</div>
              <h1>Configure your session</h1>
              <p>
                Set up a support scenario .
              </p>
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
                    aria-pressed={session.mode === mode.id}
                  >
                    <div className="mode-card-top">
                      <span className="mode-icon">{mode.icon}</span>
                      <span className="radio-indicator">
                        {session.mode === mode.id ? "✓" : ""}
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
                    placeholder="e.g. Delayed Order Support"
                  />
                </label>

                <label className="field full-width">
                  <span>Product context <b>*</b></span>
                  <textarea
                    name="product_context"
                    value={session.product_context}
                    onChange={updateField}
                    placeholder="Describe the product or service being supported..."
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
                    Example: The customer's delivery is three days late and
                    they want an update.
                  </small>
                </label>

                <label className="field">
                  <span>Customer persona</span>
                  <select
                    name="persona"
                    value={session.persona}
                    onChange={updateField}
                  >
                    <option>Neutral</option>
                    <option>Friendly</option>
                    <option>Impatient</option>
                    <option>Frustrated</option>
                  </select>
                </label>

                <label className="field">
                  <span>Difficulty level</span>
                  <select
                    name="difficulty"
                    value={session.difficulty}
                    onChange={updateField}
                  >
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
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
                onClick={restoreSession}
              >
                ↻ Restore saved session
              </button>

              <button className="button primary" type="submit">
                Save session <span>→</span>
              </button>
            </div>
          </form>

          
{savedSession && (
  <section className="session-confirmation">
    <div className="confirmation-header">
      <span className="confirmation-check">✓</span>
      <div>
        <span className="confirmation-eyebrow">SESSION SAVED</span>
        <h2>{savedSession.session_name}</h2>
        <p>Your session configuration is ready.</p>
      </div>
    </div>

    <div className="confirmation-details">
      <div>
        <span>INTERACTION MODE</span>
        <strong>{savedSession.mode}</strong>
      </div>
      <div>
        <span>PRODUCT CONTEXT</span>
        <strong>{savedSession.product_context}</strong>
      </div>
      <div>
        <span>CUSTOMER SCENARIO</span>
        <strong>{savedSession.scenario}</strong>
      </div>
      <div>
        <span>DIFFICULTY</span>
        <strong>{savedSession.difficulty}</strong>
      </div>
    </div>

    <button
      type="button"
      className="button primary"
      onClick={() => setSuccess(
        "Configuration confirmed. The interaction workflow will be available when connected to the backend."
      )}
    >
      Continue to session <span>→</span>
    </button>
  </section>
)}


          <footer>
            <span>SupportAssistant · AI Customer Support Coaching Assistant</span>
          </footer>
        </div>
        ):(
          <KnowledgeBase />
        ) }
      </main>
    </div>
  );
}

export default App;
