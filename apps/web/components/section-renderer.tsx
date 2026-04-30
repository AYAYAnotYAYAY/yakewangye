import type { PageSection } from "@quanyu/shared";
import { AnalyticsSection } from "./sections/analytics-section";
import { ArticlesSection } from "./sections/articles-section";
import { GallerySection } from "./sections/gallery-section";
import { HeroSection } from "./sections/hero-section";
import { JourneySection } from "./sections/journey-section";
import { ServicesSection } from "./sections/services-section";

type SectionRendererProps = {
  section: PageSection;
  editable?: boolean;
  onSectionChange?: (section: PageSection) => void;
};

export function SectionRenderer({ section, editable = false, onSectionChange }: SectionRendererProps) {
  switch (section.type) {
    case "hero":
      return <HeroSection section={section} editable={editable} onSectionChange={onSectionChange} />;
    case "services":
      return <ServicesSection section={section} editable={editable} onSectionChange={onSectionChange} />;
    case "journey":
      return <JourneySection section={section} editable={editable} onSectionChange={onSectionChange} />;
    case "gallery":
      return <GallerySection section={section} editable={editable} onSectionChange={onSectionChange} />;
    case "articles":
      return <ArticlesSection section={section} editable={editable} onSectionChange={onSectionChange} />;
    case "analytics":
      return <AnalyticsSection section={section} editable={editable} onSectionChange={onSectionChange} />;
    default:
      return null;
  }
}
