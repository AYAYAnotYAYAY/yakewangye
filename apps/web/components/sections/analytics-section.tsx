import type { AnalyticsSection as AnalyticsSectionType } from "@quanyu/shared";

type AnalyticsProps = {
  section: AnalyticsSectionType;
};

export function AnalyticsSection({ section }: AnalyticsProps) {
  return (
    <section>
      <div className="container">
        <div
          className="card"
          style={{
            padding: 24,
            background: "linear-gradient(135deg, #07162a, #0b2340)",
            color: "#fff",
          }}
        >
          <div className="section-heading" style={{ marginBottom: 0 }}>
            <span
              className="eyebrow"
              style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
            >
              {section.eyebrow}
            </span>
            <h2>{section.title}</h2>
            <p style={{ color: "rgba(255,255,255,0.72)" }}>{section.description}</p>
          </div>
          <div className="grid-3" style={{ marginTop: 16 }}>
            {section.metrics.map((metric) => (
              <div
                key={metric.label}
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 18,
                  padding: 18,
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{metric.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{metric.value}</div>
                <div style={{ fontSize: 14, marginTop: 6 }}>{metric.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
