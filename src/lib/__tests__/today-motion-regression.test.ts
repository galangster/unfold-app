import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const readSource = (relativePath: string) => fs.readFileSync(path.join(sourceRoot, relativePath), 'utf-8');

describe('Today tab motion guardrails', () => {
  const myContentSource = readSource('app/(tabs)/(you)/my-content.tsx');
  const pastDevotionalsSource = readSource('app/(tabs)/(you)/past-devotionals.tsx');
  const bentoGridSource = readSource('components/home/BentoGrid.tsx');
  const devotionalCardSource = readSource('components/home/DevotionalCard.tsx');

  it('suppresses the My Library initial cross-tab content slide without disabling later tab transitions', () => {
    expect(myContentSource).toContain("const isHomeEntry = params.from === 'home';");
    expect(myContentSource).toContain('suppressInitialContentMotion');
    expect(myContentSource).toContain('setSuppressInitialContentMotion(false);');
    expect(myContentSource).toContain('function getInitialTab(tab?: string): Tab {');
    expect(myContentSource).toContain('const [activeTab, setActiveTab] = useState<Tab>(() => getInitialTab(params.tab));');
    expect(myContentSource).toContain('const libraryContentEntering =');
    expect(myContentSource).toContain('suppressInitialContentMotion || reducedMotion');
    expect(myContentSource).toContain('entering={libraryContentEntering}');
  });

  it('honors reduced motion for the My Library empty-state icon pulse', () => {
    const pulseStart = myContentSource.indexOf('const iconPulse = useSharedValue(1);');
    const repeatStart = myContentSource.indexOf('iconPulse.value = withRepeat(', pulseStart);
    const reducedMotionGuard = myContentSource.indexOf('if (reducedMotion) {', pulseStart);

    expect(pulseStart).toBeGreaterThan(-1);
    expect(reducedMotionGuard).toBeGreaterThan(pulseStart);
    expect(reducedMotionGuard).toBeLessThan(repeatStart);
    expect(myContentSource).toContain('cancelAnimation(iconPulse);');
  });

  it('keeps My Devotionals segmented indicator shared-value writes out of render', () => {
    expect(pastDevotionalsSource).not.toContain('if (prevIndex.current !== activeIndex && segmentWidth > 0) {\n    indicatorTranslateX.value');
    expect(pastDevotionalsSource).not.toContain('if (containerWidth > 0 && containerWidthRef.current !== containerWidth) {\n    containerWidthRef.current = containerWidth;\n    indicatorTranslateX.value');
    expect(pastDevotionalsSource).toContain('useEffect(() => {\n    if (segmentWidth <= 0) return;');
    expect(pastDevotionalsSource).toContain('indicatorTranslateX.value = withTiming(activeIndex * segmentWidth');
  });

  it('orders Today section entrances from hero to context to streak to bento', () => {
    expect(bentoGridSource).toContain('FadeIn.duration(Duration.normal).delay(260).easing(Ease.out)');
  });

  it('respects reduced motion for the first-time Today title character reveal', () => {
    expect(devotionalCardSource).toContain('const { reducedMotion } = useAccessibleAnimation();');
    expect(devotionalCardSource).toContain('opacity.value = 1;');
    expect(devotionalCardSource).toContain('colorProgress.value = 1;');
    expect(devotionalCardSource).toContain('cancelAnimation(opacity);');
    expect(devotionalCardSource).toContain('cancelAnimation(colorProgress);');
  });
});
