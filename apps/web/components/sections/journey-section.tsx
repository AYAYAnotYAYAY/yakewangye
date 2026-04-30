import type { JourneySection as JourneySectionType } from "@quanyu/shared";
import { InlineEditableText } from "../inline-editable-text";

type JourneyProps = {
  section: JourneySectionType;
  editable?: boolean;
  onSectionChange?: (section: JourneySectionType) => void;
};

export function JourneySection({ section, editable = false, onSectionChange }: JourneyProps) {
  const change = (next: JourneySectionType) => onSectionChange?.(next);

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
        <div className="grid-2">
          {section.steps.map((step, index) => (
            <div key={step.title} className="card" style={{ padding: 22 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                0{index + 1}
              </div>
              {editable ? (
                <InlineEditableText
                  as="h3"
                  value={step.title}
                  onChange={(value) =>
                    change({
                      ...section,
                      steps: section.steps.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, title: value } : entry,
                      ),
                    })
                  }
                />
              ) : (
                <h3>{step.title}</h3>
              )}
              {editable ? (
                <InlineEditableText
                  as="p"
                  value={step.summary}
                  multiline
                  onChange={(value) =>
                    change({
                      ...section,
                      steps: section.steps.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, summary: value } : entry,
                      ),
                    })
                  }
                />
              ) : (
                <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{step.summary}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
