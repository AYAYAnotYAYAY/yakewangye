import type { HeroSection as HeroSectionType } from "@quanyu/shared";

type HeroProps = {
  section: HeroSectionType;
};

export function HeroSection({ section }: HeroProps) {
  return (
    <section>
      <div className="container">
        <div
          className="card"
          style={{
            padding: 28,
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: 18,
            overflow: "hidden",
          }}
        >
          <div>
            <span className="eyebrow">{section.eyebrow}</span>
            <h1
              style={{
                fontSize: "clamp(34px, 5vw, 58px)",
                lineHeight: 1.05,
                margin: "18px 0 16px",
              }}
            >
              {section.title}
            </h1>
            <p style={{ fontSize: 18, color: "var(--muted)", lineHeight: 1.7 }}>
              {section.description}
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
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
            <div className="grid-3" style={{ marginTop: 22 }}>
              {section.highlights.map((item) => (
                <div key={item.label} className="card" style={{ padding: 16, boxShadow: "none" }}>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{item.label}</div>
                  <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              borderRadius: 18,
              background:
                "linear-gradient(155deg, rgba(11,92,255,0.98), rgba(20,194,163,0.92))",
              padding: 24,
              color: "#fff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              minHeight: 420,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 24 }}>{section.aiPanel.title}</div>
              <p style={{ lineHeight: 1.7, color: "rgba(255,255,255,0.88)" }}>
                {section.aiPanel.description}
              </p>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {section.aiPanel.steps.map((step) => (
                <div
                  key={step}
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.24)",
                    borderRadius: 16,
                    padding: 14,
                  }}
                >
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
