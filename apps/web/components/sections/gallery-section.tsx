import type { GallerySection as GallerySectionType } from "@quanyu/shared";

type GalleryProps = {
  section: GallerySectionType;
};

export function GallerySection({ section }: GalleryProps) {
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
            <div key={item.title} className="card" style={{ overflow: "hidden" }}>
              <div
                style={{
                  minHeight: 190,
                  background: item.cover,
                }}
              />
              <div style={{ padding: 18 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>{item.title}</div>
                <div style={{ color: "var(--muted)", lineHeight: 1.7 }}>{item.summary}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
