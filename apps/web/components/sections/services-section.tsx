import type { ServicesSection as ServicesSectionType } from "@quanyu/shared";
import { InlineEditableText } from "../inline-editable-text";

type ServicesProps = {
  section: ServicesSectionType;
  editable?: boolean;
  onSectionChange?: (section: ServicesSectionType) => void;
};

export function ServicesSection({ section, editable = false, onSectionChange }: ServicesProps) {
  const change = (next: ServicesSectionType) => onSectionChange?.(next);

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
            <article key={item.title} className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 14, color: "var(--primary)", fontWeight: 700 }}>
                {editable ? (
                  <InlineEditableText
                    value={item.tag}
                    onChange={(value) =>
                      change({
                        ...section,
                        items: section.items.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, tag: value } : entry,
                        ),
                      })
                    }
                  />
                ) : (
                  item.tag
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
                <h3 style={{ marginBottom: 10 }}>{item.title}</h3>
              )}
              {editable ? (
                <InlineEditableText
                  as="p"
                  value={item.summary}
                  multiline
                  onChange={(value) =>
                    change({
                      ...section,
                      items: section.items.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, summary: value } : entry,
                      ),
                    })
                  }
                />
              ) : (
                <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{item.summary}</p>
              )}
              <div style={{ marginTop: 16, fontWeight: 700 }}>
                {editable ? (
                  <InlineEditableText
                    value={item.ctaLabel}
                    onChange={(value) =>
                      change({
                        ...section,
                        items: section.items.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, ctaLabel: value } : entry,
                        ),
                      })
                    }
                  />
                ) : (
                  item.ctaLabel
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
