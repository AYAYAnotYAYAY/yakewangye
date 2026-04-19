import type { PageSection } from "@quanyu/shared";
import { AnalyticsSection } from "./sections/analytics-section";
import { ArticlesSection } from "./sections/articles-section";
import { GallerySection } from "./sections/gallery-section";
import { HeroSection } from "./sections/hero-section";
import { JourneySection } from "./sections/journey-section";
import { ServicesSection } from "./sections/services-section";

type SectionRendererProps = {
  section: PageSection;
};

export function SectionRenderer({ section }: SectionRendererProps) {
  switch (section.type) {
    case "hero":
      return <HeroSection section={section} />;
    case "services":
      return <ServicesSection section={section} />;
    case "journey":
      return <JourneySection section={section} />;
    case "gallery":
      return <GallerySection section={section} />;
    case "articles":
      return <ArticlesSection section={section} />;
    case "analytics":
      return <AnalyticsSection section={section} />;
    default:
      return null;
  }
}
