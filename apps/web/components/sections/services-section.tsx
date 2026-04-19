import type { ServicesSection as ServicesSectionType } from "@quanyu/shared";

type ServicesProps = {
  section: ServicesSectionType;
};

export function ServicesSection({ section }: ServicesProps) {
  return (
    <section>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">{section.eyebrow}</span>
          <h2>{section.title}</h2>
          <p>{section.description}</p>
        </div>
        <div className="grid-3">
          {section.items.map((item) => (
            <article key={item.title} className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 14, color: "var(--primary)", fontWeight: 700 }}>
                {item.tag}
              </div>
              <h3 style={{ marginBottom: 10 }}>{item.title}</h3>
              <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{item.summary}</p>
              <div style={{ marginTop: 16, fontWeight: 700 }}>{item.ctaLabel}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
