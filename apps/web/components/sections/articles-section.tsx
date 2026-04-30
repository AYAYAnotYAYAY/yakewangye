import type { ArticlesSection as ArticlesSectionType } from "@quanyu/shared";
import { InlineEditableText } from "../inline-editable-text";

type ArticlesProps = {
  section: ArticlesSectionType;
  editable?: boolean;
  onSectionChange?: (section: ArticlesSectionType) => void;
};

export function ArticlesSection({ section, editable = false, onSectionChange }: ArticlesProps) {
  const change = (next: ArticlesSectionType) => onSectionChange?.(next);

  return (
    <section>
      <div className="container">
        <div className="section-heading">
          {editable ? (
            <InlineEditableText as="span" className="eyebrow" value={section.eyebrow} onChange={(value) => change({ ...section, eyebrow: value })} />
          ) : (
            <span className="eyebrow">{section.eyebrow}</span>
          )}
          {editable ? (
            <InlineEditableText as="h2" value={section.title} multiline onChange={(value) => change({ ...section, title: value })} />
          ) : (
            <h2>{section.title}</h2>
          )}
          {editable ? (
            <InlineEditableText as="p" value={section.description} multiline onChange={(value) => change({ ...section, description: value })} />
          ) : (
            <p>{section.description}</p>
          )}
        </div>
        <div className="grid-3">
          {section.items.map((item, index) => (
            <article key={item.slug} className="card" style={{ padding: 20 }}>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {editable ? (
                  <InlineEditableText
                    value={item.category}
                    onChange={(value) =>
                      change({
                        ...section,
                        items: section.items.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, category: value } : entry,
                        ),
                      })
                    }
                  />
                ) : (
                  item.category
                )}
              </div>
              {editable ? (
                <InlineEditableText
                  as="h3"
                  value={item.title}
                  onChange={(value) =>
                    change({
                      ...section,
                      items: section.items.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, title: value } : entry,
                      ),
                    })
                  }
                />
              ) : (
                <h3>{item.title}</h3>
              )}
              {editable ? (
                <InlineEditableText
                  as="p"
                  value={item.excerpt}
                  multiline
                  onChange={(value) =>
                    change({
                      ...section,
                      items: section.items.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, excerpt: value } : entry,
                      ),
                    })
                  }
                />
              ) : (
                <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{item.excerpt}</p>
              )}
              <div style={{ marginTop: 14, fontWeight: 700 }}>
                {editable ? (
                  <InlineEditableText
                    value={item.seoTitle}
                    onChange={(value) =>
                      change({
                        ...section,
                        items: section.items.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, seoTitle: value } : entry,
                        ),
                      })
                    }
                  />
                ) : (
                  item.seoTitle
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
