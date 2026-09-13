import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, UIManager, type LayoutChangeEvent } from 'react-native';
import { Spacing } from '@/constants/spacing';

export type SettingsSection = 'reminders' | 'appearance';

export function settingsSectionScrollOffset(sectionY: number, contentOffset = 0): number {
  return Math.max(sectionY + contentOffset - Spacing['4'], 0);
}

export function useSettingsSectionScroll(section?: string, contentOffset = 0) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [nativeTarget, setNativeTarget] = useState<number | null>(null);
  const handleScrollLayout = useCallback((event: LayoutChangeEvent) => {
    const target = (event.nativeEvent as { target?: number }).target;
    setNativeTarget(typeof target === 'number' ? target : null);
  }, []);
  const [sectionOffsets, setSectionOffsets] = useState<Partial<Record<SettingsSection, number>>>({});

  const handleSectionLayout = useCallback(
    (target: SettingsSection) => (e: LayoutChangeEvent) => {
      const y = e.nativeEvent.layout.y;
      setSectionOffsets((prev) => (prev[target] === y ? prev : { ...prev, [target]: y }));
    },
    [],
  );

  useEffect(() => {
    const target: SettingsSection | undefined =
      section === 'reminders' || section === 'appearance' ? section : undefined;
    if (!target) return;
    const y = sectionOffsets[target];
    if (y === undefined || (!scrollViewRef.current && nativeTarget === null)) return;
    const frame = requestAnimationFrame(() => {
      const offset = settingsSectionScrollOffset(y, contentOffset);
      const scrollView = scrollViewRef.current;
      if (scrollView?.scrollTo) {
        scrollView.scrollTo({ y: offset, animated: false });
      } else if (nativeTarget !== null) {
        UIManager.dispatchViewManagerCommand(nativeTarget, 'scrollTo', [0, offset, false]);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [section, sectionOffsets, nativeTarget, contentOffset]);

  return { scrollViewRef, handleScrollLayout, handleSectionLayout };
}
