import { MotionReveal } from '../MotionReveal';
import { SectionTitle, SectionTitleHighlight } from '../shared/section-title';

export function PortfolioSectionHeader() {
  return (
    <MotionReveal from="translateY(-40px)">
      <div className="text-center max-w-4xl mx-auto mb-8 sm:mb-10 lg:mb-12 flex flex-col items-center">
        <SectionTitle tone="inverse">
          نبذة عن <SectionTitleHighlight>أعمالنا</SectionTitleHighlight>
        </SectionTitle>
      </div>
    </MotionReveal>
  );
}
