import type { GallerySection as GallerySectionType } from "@quanyu/shared";
import { InlineEditableText } from "../inline-editable-text";

type GalleryProps = {
  section: GallerySectionType;
  editable?: boolean;
  onSectionChange?: (section: GallerySectionType) => void;
};

export function GallerySection({ section, editable = false, onSectionChange }: GalleryProps) {
  const change = (next: GallerySectionType) => onSectionChange?.(next);

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
            <div key={item.title} className="card" style={{ overflow: "hidden" }}>
              <div
                style={{
                  minHeight: 190,
                  background: item.cover,
                }}
              />
              <div style={{ padding: 18 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  {editable ? (
                    <InlineEditableText
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
                    item.title
                  )}
                </div>
                {editable ? (
                  <InlineEditableText
                    as="div"
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
                  <div style={{ color: "var(--muted)", lineHeight: 1.7 }}>{item.summary}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
