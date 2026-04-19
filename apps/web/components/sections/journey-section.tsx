import type { JourneySection as JourneySectionType } from "@quanyu/shared";

type JourneyProps = {
  section: JourneySectionType;
};

export function JourneySection({ section }: JourneyProps) {
  return (
    <section>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">{section.eyebrow}</span>
          <h2>{section.title}</h2>
          <p>{section.description}</p>
        </div>
        <div className="grid-2">
          {section.steps.map((step, index) => (
            <div key={step.title} className="card" style={{ padding: 22 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                0{index + 1}
              </div>
              <h3>{step.title}</h3>
              <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{step.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
