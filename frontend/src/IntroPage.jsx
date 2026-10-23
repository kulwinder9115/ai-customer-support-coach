
import "./IntroPage.css";

export default function IntroPage({ onGetStarted }) {
  return (
    <main className="landing">
      <div className="landing-overlay" />

      <header className="landing-header">
        <a className="landing-brand" href="#home">
          <span className="landing-mark">✳</span>
          SupportAssistant
        </a>
       
      </header>

      <section className="landing-content" id="home">
        

        <h2>
         AI CUSTOMER SUPPORT COACH
        </h2>

        <p className="landing-description">
          Practice real support scenarios, find the right information,
          and get AI-powered guidance to handle customer conversations
          with confidence.
        </p>

        <button
          type="button"
          className="landing-cta"
          onClick={onGetStarted}
        >
          Get started <span aria-hidden="true">→</span>
        </button>

       
      </section>

      
    </main>
  );
}
