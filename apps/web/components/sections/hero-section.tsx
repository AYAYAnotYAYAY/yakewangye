import type { HeroSection as HeroSectionType } from "@quanyu/shared";
import { InlineEditableText } from "../inline-editable-text";

type HeroProps = {
  section: HeroSectionType;
  editable?: boolean;
  onSectionChange?: (section: HeroSectionType) => void;
};

export function HeroSection({ section, editable = false, onSectionChange }: HeroProps) {
  const change = (next: HeroSectionType) => onSectionChange?.(next);

  return (
    <section>
      <div className="container">
        <div className="card hero-card">
          {/* Left column */}
          <div className="hero-left">
            {editable ? (
              <InlineEditableText
                as="span"
                className="eyebrow"
                value={section.eyebrow}
                onChange={(value) => change({ ...section, eyebrow: value })}
              />
            ) : (
              <span className="eyebrow">{section.eyebrow}</span>
            )}
            {editable ? (
              <InlineEditableText
                as="h1"
                className="hero-title"
                value={section.title}
                multiline
                onChange={(value) => change({ ...section, title: value })}
              />
            ) : (
              <h1 className="hero-title">{section.title}</h1>
            )}
            {editable ? (
              <InlineEditableText
                as="p"
                className="hero-desc"
                value={section.description}
                multiline
                onChange={(value) => change({ ...section, description: value })}
              />
            ) : (
              <p className="hero-desc">{section.description}</p>
            )}
            <div className="hero-actions">
              {section.actions.map((action) => (
                editable ? (
                  <button
                    key={action.label}
                    className={`button ${action.variant === "primary" ? "primary" : "secondary"}`}
                    type="button"
                  >
                    <InlineEditableText
                      value={action.label}
                      onChange={(value) =>
                        change({
                          ...section,
                          actions: section.actions.map((item) =>
                            item === action ? { ...item, label: value } : item,
                          ),
                        })
                      }
                    />
                  </button>
                ) : (
                  <a
                    key={action.label}
                    className={`button ${action.variant === "primary" ? "primary" : "secondary"}`}
                    href={action.href}
                  >
                    {action.label}
                  </a>
                )
              ))}
            </div>
            <div className="hero-highlights">
              {section.highlights.map((item, index) => (
                <div key={item.label} className="card hero-highlight-card">
                  {editable ? (
                    <InlineEditableText
                      as="div"
                      className="hero-highlight-label"
                      value={item.label}
                      onChange={(value) =>
                        change({
                          ...section,
                          highlights: section.highlights.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, label: value } : entry,
                          ),
                        })
                      }
                    />
                  ) : (
                    <div className="hero-highlight-label">{item.label}</div>
                  )}
                  {editable ? (
                    <InlineEditableText
                      as="div"
                      className="hero-highlight-value"
                      value={item.value}
                      onChange={(value) =>
                        change({
                          ...section,
                          highlights: section.highlights.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, value } : entry,
                          ),
                        })
                      }
                    />
                  ) : (
                    <div className="hero-highlight-value">{item.value}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right column – AI panel */}
          <div className="hero-ai-panel">
            <div>
              {editable ? (
                <InlineEditableText
                  as="div"
                  className="hero-ai-title"
                  value={section.aiPanel.title}
                  onChange={(value) => change({ ...section, aiPanel: { ...section.aiPanel, title: value } })}
                />
              ) : (
                <div className="hero-ai-title">{section.aiPanel.title}</div>
              )}
              {editable ? (
                <InlineEditableText
                  as="p"
                  className="hero-ai-desc"
                  value={section.aiPanel.description}
                  multiline
                  onChange={(value) => change({ ...section, aiPanel: { ...section.aiPanel, description: value } })}
                />
              ) : (
                <p className="hero-ai-desc">{section.aiPanel.description}</p>
              )}
            </div>
            <div className="hero-ai-steps">
              {section.aiPanel.steps.map((step, index) => (
                <div key={step} className="hero-ai-step">
                  {editable ? (
                    <InlineEditableText
                      value={step}
                      onChange={(value) =>
                        change({
                          ...section,
                          aiPanel: {
                            ...section.aiPanel,
                            steps: section.aiPanel.steps.map((item, itemIndex) => (itemIndex === index ? value : item)),
                          },
                        })
                      }
                    />
                  ) : (
                    step
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
