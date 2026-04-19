import type { HeroSection as HeroSectionType } from "@quanyu/shared";

type HeroProps = {
  section: HeroSectionType;
};

export function HeroSection({ section }: HeroProps) {
  return (
    <section>
      <div className="container">
        <div className="card hero-card">
          {/* Left column */}
          <div className="hero-left">
            <span className="eyebrow">{section.eyebrow}</span>
            <h1 className="hero-title">{section.title}</h1>
            <p className="hero-desc">{section.description}</p>
            <div className="hero-actions">
              {section.actions.map((action) => (
                <a
                  key={action.label}
                  className={`button ${action.variant === "primary" ? "primary" : "secondary"}`}
                  href={action.href}
                >
                  {action.label}
                </a>
              ))}
            </div>
            <div className="hero-highlights">
              {section.highlights.map((item) => (
                <div key={item.label} className="card hero-highlight-card">
                  <div className="hero-highlight-label">{item.label}</div>
                  <div className="hero-highlight-value">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column – AI panel */}
          <div className="hero-ai-panel">
            <div>
              <div className="hero-ai-title">{section.aiPanel.title}</div>
              <p className="hero-ai-desc">{section.aiPanel.description}</p>
            </div>
            <div className="hero-ai-steps">
              {section.aiPanel.steps.map((step) => (
                <div key={step} className="hero-ai-step">
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
