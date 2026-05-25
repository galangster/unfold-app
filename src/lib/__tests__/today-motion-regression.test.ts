import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const readSource = (relativePath: string) => fs.readFileSync(path.join(sourceRoot, relativePath), 'utf-8');

describe('Today tab motion guardrails', () => {
  const todayLayoutSource = readSource('app/(tabs)/(today)/_layout.tsx');
  const todayMyContentSource = readSource('app/(tabs)/(today)/my-content.tsx');
  const todayPastDevotionalsSource = readSource('app/(tabs)/(today)/past-devotionals.tsx');
  const todaySeriesDetailSource = readSource('app/(tabs)/(today)/series-detail.tsx');
  const todayReadingSource = readSource('app/(tabs)/(today)/reading.tsx');
  const myContentSource = readSource('app/(tabs)/(you)/my-content.tsx');
  const pastDevotionalsSource = readSource('app/(tabs)/(you)/past-devotionals.tsx');
  const bentoGridSource = readSource('components/home/BentoGrid.tsx');
  const devotionalCardSource = readSource('components/home/DevotionalCard.tsx');
  const contextSlotSource = readSource('components/home/ContextSlot.tsx');
  const dailyBridgeCardSource = readSource('components/home/DailyBridgeCard.tsx');
  const todayCompanionBubbleSource = readSource('components/home/TodayCompanionBubble.tsx');
  const bridgeShimmerSource = readSource('components/home/BridgeShimmer.tsx');
  const notificationCardSource = readSource('components/home/NotificationCard.tsx');
  const rememberThisCardSource = readSource('components/home/RememberThisCard.tsx');
  const todayIndexSource = readSource('app/(tabs)/(today)/index.tsx');
  const todayCardStackSource = readSource('components/home/TodayCardStack.tsx');
  const crossTabBackSource = readSource('hooks/useCrossTabBack.ts');
  const seriesCarouselSource = readSource('components/home/SeriesCarousel.tsx');
  const yourSeriesSectionSource = readSource('components/home/YourSeriesSection.tsx');

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

  it('opens Today bento library screens inside the Today stack so iOS back-swipe previews Today, not the hidden You stack', () => {
    expect(todayLayoutSource).toContain('<Stack.Screen name="my-content"');
    expect(todayLayoutSource).toContain('<Stack.Screen name="past-devotionals"');
    expect(todayLayoutSource).toContain('<Stack.Screen name="series-detail"');
    expect(todayMyContentSource).toContain("export { default } from '../(you)/my-content';");
    expect(todayPastDevotionalsSource).toContain("export { default } from '../(you)/past-devotionals';");
    expect(todaySeriesDetailSource).toContain("export { default } from '../(you)/series-detail';");
    expect(bentoGridSource).toContain("pathname: '/(tabs)/(today)/past-devotionals'");
    expect(bentoGridSource).toContain("pathname: '/(tabs)/(today)/my-content'");
    expect(bentoGridSource).not.toContain("pathname: '/(tabs)/(you)/past-devotionals'");
    expect(bentoGridSource).not.toContain("pathname: '/(tabs)/(you)/my-content'");
    expect(seriesCarouselSource).toContain("pathname: '/(tabs)/(today)/past-devotionals'");
    expect(seriesCarouselSource).not.toContain("pathname: '/(tabs)/(you)/past-devotionals'");
    expect(yourSeriesSectionSource).toContain("pathname: '/(tabs)/(today)/past-devotionals'");
    expect(yourSeriesSectionSource).not.toContain("pathname: '/(tabs)/(you)/past-devotionals'");
    expect(todayReadingSource).toContain("pathname: '/(tabs)/(today)/my-content'");
    expect(todayReadingSource).not.toContain("pathname: '/(tabs)/(you)/my-content'");
    expect(crossTabBackSource).toContain("return currentTab !== sourceTab;");
  });

  it('keeps Today cards copy-first by omitting static decorative line-art layers', () => {
    expect(devotionalCardSource).not.toContain('HeroMotionGlyph');
    expect(devotionalCardSource).not.toContain('heroMotionGlyph');
    expect(devotionalCardSource).not.toContain('editorialStateArt');
    expect(devotionalCardSource).not.toContain('revealSealArt');
    expect(devotionalCardSource).not.toContain('preparingOrbitalArt');
    expect(devotionalCardSource).not.toContain('journeyCompleteArt');
    expect(contextSlotSource).not.toContain('resumeArt');
    expect(notificationCardSource).not.toContain('artLayer');
    expect(dailyBridgeCardSource).not.toContain('artLayer');
    expect(rememberThisCardSource).not.toContain('decorativeLayer');
    expect(todayIndexSource).not.toContain('day1ReviewArt');
  });

  it('keeps the optional Today context stack under the hero instead of above it', () => {
    const contextZoneIndex = todayIndexSource.indexOf('/* Zone 2: Context stack moved under the hero in Phase 3. */');
    const heroZoneIndex = todayIndexSource.indexOf("/* Zone 3: Hero Devotional — Today's primary act */");
    const todayCardStackIndex = todayIndexSource.indexOf('<TodayCardStack', heroZoneIndex);
    const dailyRhythmIndex = todayIndexSource.indexOf('/* Zone 6: Daily Rhythm */', todayCardStackIndex);
    const revealStart = devotionalCardSource.indexOf('function RevealReadyState');
    const revealEnd = devotionalCardSource.indexOf('// ─── Preparing progress bar', revealStart);
    const revealSource = devotionalCardSource.slice(revealStart, revealEnd);
    const companionDismissStyleStart = todayCompanionBubbleSource.indexOf('dismissButton: {');
    const companionDismissStyleEnd = todayCompanionBubbleSource.indexOf('orbWrap:', companionDismissStyleStart);
    const companionDismissStyle = todayCompanionBubbleSource.slice(companionDismissStyleStart, companionDismissStyleEnd);

    expect(contextZoneIndex).toBeGreaterThan(-1);
    expect(heroZoneIndex).toBeGreaterThan(contextZoneIndex);
    expect(todayCardStackIndex).toBeGreaterThan(heroZoneIndex);
    expect(dailyRhythmIndex).toBeGreaterThan(todayCardStackIndex);
    expect(todayIndexSource).toContain('hasOptionalTodayStack && (');
    expect(todayIndexSource).toContain('cards={todayStackCards}');
    expect(todayIndexSource).toContain('style={styles.todayStackWrapper}');
    expect(todayIndexSource).toContain('hasOptionalTodayStack ? styles.rhythmAfterOptionalStack : styles.rhythmAfterHero');

    expect(dailyBridgeCardSource).toContain('TodayCompanionBubble');
    expect(todayCompanionBubbleSource).toContain('CompanionOrb');
    expect(todayCompanionBubbleSource).toContain('styles.bubble');
    expect(todayCompanionBubbleSource).toContain('Companion says:');
    expect(todayCompanionBubbleSource).toContain('XIcon size={13}');
    expect(todayCompanionBubbleSource).not.toContain('DismissCircleButton');
    expect(companionDismissStyle).not.toContain('borderRadius');
    expect(companionDismissStyle).not.toContain('borderWidth');
    expect(companionDismissStyle).not.toContain('backgroundColor');
    expect(companionDismissStyle).not.toContain('shadow');
    expect(companionDismissStyle).not.toContain('elevation');
    expect(dailyBridgeCardSource).not.toContain('Companion bridge');
    expect(todayCompanionBubbleSource).not.toContain('Companion bridge');
    expect(dailyBridgeCardSource).not.toContain('A small thread from yesterday into today');
    expect(todayCompanionBubbleSource).not.toContain('A small thread from yesterday into today');
    expect(dailyBridgeCardSource).not.toContain('Shadow');
    expect(todayCompanionBubbleSource).not.toContain('Shadow');

    expect(bridgeShimmerSource).toContain('TodayCompanionBubble');
    expect(todayCompanionBubbleSource).toContain('styles.bubble');
    expect(bridgeShimmerSource).not.toContain('Companion bridge');
    expect(todayCompanionBubbleSource).not.toContain('Companion bridge');
    expect(bridgeShimmerSource).not.toContain('Shadow');
    expect(todayCompanionBubbleSource).not.toContain('Shadow');

    expect(revealSource).toContain('styles.revealOpenHero');
    expect(revealSource).not.toContain('styles.revealCard');
    expect(devotionalCardSource).not.toContain('revealCard:');

    expect(todayCardStackSource).toContain('backgroundColor: alpha(colors.accent, fillOpacity)');
    expect(todayCardStackSource).toContain('const fillOpacity = Math.max(isDark ? 0.1 : 0.065');
    expect(todayCardStackSource).not.toContain('backgroundColor: alpha(colors.backgroundPure');
    expect(todayCardStackSource).not.toContain('borderOpacity');
  });

  it('keeps the open Today hero focused on title and pull quote without repeating the scripture reference', () => {
    const mainCardStart = devotionalCardSource.indexOf('function MainCard');
    const mainCardEnd = devotionalCardSource.indexOf('// ─── DevotionalCard (root)', mainCardStart);
    const mainCardSource = devotionalCardSource.slice(mainCardStart, mainCardEnd);
    const revealStart = devotionalCardSource.indexOf('function RevealReadyState');
    const revealEnd = devotionalCardSource.indexOf('// ─── Preparing progress bar', revealStart);
    const revealSource = devotionalCardSource.slice(revealStart, revealEnd);
    const heroSeriesStyleStart = devotionalCardSource.indexOf('heroSeriesEyebrow: {');
    const heroSeriesStyleEnd = devotionalCardSource.indexOf('heroDayMeta:', heroSeriesStyleStart);
    const heroSeriesStyle = devotionalCardSource.slice(heroSeriesStyleStart, heroSeriesStyleEnd);
    const heroDayMetaStyleStart = devotionalCardSource.indexOf('heroDayMeta: {');
    const heroDayMetaStyleEnd = devotionalCardSource.indexOf('heroDayMetaRow:', heroDayMetaStyleStart);
    const heroDayMetaStyle = devotionalCardSource.slice(heroDayMetaStyleStart, heroDayMetaStyleEnd);

    expect(mainCardStart).toBeGreaterThan(-1);
    expect(mainCardEnd).toBeGreaterThan(mainCardStart);
    expect(mainCardSource).not.toContain('dayData.scriptureReference');
    expect(mainCardSource).not.toContain('heroScriptureRow');
    expect(mainCardSource).not.toContain('heroScriptureRule');
    expect(mainCardSource).not.toContain('heroScripture');

    expect(revealSource).toContain('const displaySeriesTitle = formatHeroSeriesTitle(state.seriesTitle);');
    expect(revealSource).toContain('{displaySeriesTitle}');
    expect(devotionalCardSource).toContain('function formatHeroSeriesTitle(title: string): string');
    expect(heroSeriesStyle).not.toContain("textTransform: 'uppercase'");
    expect(heroDayMetaStyle).not.toContain("textTransform: 'uppercase'");
    expect(heroSeriesStyle).toContain('letterSpacing: 0.45');
    expect(heroDayMetaStyle).toContain('letterSpacing: 0.35');
  });

  it('keeps devotional detail navigation in the Today stack when My Devotionals was opened from Today', () => {
    expect(pastDevotionalsSource).toContain('const { handleBack, isFromHome } = useCrossTabBack();');
    expect(pastDevotionalsSource).toContain("pathname: isFromHome ? '/(tabs)/(today)/series-detail' : '/(tabs)/(you)/series-detail'");
    expect(pastDevotionalsSource).toContain('params: { id }');
  });

  it('respects reduced motion for the first-time Today title character reveal', () => {
    expect(devotionalCardSource).toContain('const { reducedMotion } = useAccessibleAnimation();');
    expect(devotionalCardSource).toContain('opacity.value = 1;');
    expect(devotionalCardSource).toContain('colorProgress.value = 1;');
    expect(devotionalCardSource).toContain('cancelAnimation(opacity);');
    expect(devotionalCardSource).toContain('cancelAnimation(colorProgress);');
  });
});
