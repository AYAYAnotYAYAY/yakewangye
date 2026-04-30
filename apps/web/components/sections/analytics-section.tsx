import type { AnalyticsSection as AnalyticsSectionType } from "@quanyu/shared";
import { InlineEditableText } from "../inline-editable-text";

type AnalyticsProps = {
  section: AnalyticsSectionType;
  editable?: boolean;
  onSectionChange?: (section: AnalyticsSectionType) => void;
};

export function AnalyticsSection({ section, editable = false, onSectionChange }: AnalyticsProps) {
  const change = (next: AnalyticsSectionType) => onSectionChange?.(next);

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
            {editable ? (
              <InlineEditableText
                as="span"
                className="eyebrow"
                value={section.eyebrow}
                onChange={(value) => change({ ...section, eyebrow: value })}
              />
            ) : (
              <span
                className="eyebrow"
                style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
              >
                {section.eyebrow}
              </span>
            )}
            {editable ? (
              <InlineEditableText as="h2" value={section.title} multiline onChange={(value) => change({ ...section, title: value })} />
            ) : (
              <h2>{section.title}</h2>
            )}
            {editable ? (
              <InlineEditableText
                as="p"
                value={section.description}
                multiline
                onChange={(value) => change({ ...section, description: value })}
              />
            ) : (
              <p style={{ color: "rgba(255,255,255,0.72)" }}>{section.description}</p>
            )}
          </div>
          <div className="grid-3" style={{ marginTop: 16 }}>
            {section.metrics.map((metric, index) => (
              <div
                key={metric.label}
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 18,
                  padding: 18,
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                  {editable ? (
                    <InlineEditableText
                      value={metric.label}
                      onChange={(value) =>
                        change({
                          ...section,
                          metrics: section.metrics.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, label: value } : entry,
                          ),
                        })
                      }
                    />
                  ) : (
                    metric.label
                  )}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>
                  {editable ? (
                    <InlineEditableText
                      value={metric.value}
                      onChange={(value) =>
                        change({
                          ...section,
                          metrics: section.metrics.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, value } : entry,
                          ),
                        })
                      }
                    />
                  ) : (
                    metric.value
                  )}
                </div>
                <div style={{ fontSize: 14, marginTop: 6 }}>
                  {editable ? (
                    <InlineEditableText
                      value={metric.note}
                      multiline
                      onChange={(value) =>
                        change({
                          ...section,
                          metrics: section.metrics.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, note: value } : entry,
                          ),
                        })
                      }
                    />
                  ) : (
                    metric.note
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
