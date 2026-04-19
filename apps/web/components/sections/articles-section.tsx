import type { ArticlesSection as ArticlesSectionType } from "@quanyu/shared";

type ArticlesProps = {
  section: ArticlesSectionType;
};

export function ArticlesSection({ section }: ArticlesProps) {
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
            <article key={item.slug} className="card" style={{ padding: 20 }}>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>{item.category}</div>
              <h3>{item.title}</h3>
              <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{item.excerpt}</p>
              <div style={{ marginTop: 14, fontWeight: 700 }}>{item.seoTitle}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
