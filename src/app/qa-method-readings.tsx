import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { QaMethodReadingsScreen } from '@/components/qa/QaMethodReadingsScreen';
import {
  buildQaMethodBibleHref,
  type QaMethodReadingExample,
  type QaMethodReadingPassage,
} from '@/lib/qa-method-readings';
import {
  clearQaMethodReadingReturn,
  setQaMethodReadingReturn,
} from '@/lib/qa-method-reading-return';
import {
  normalizeQaMethodParam,
  qaMethodReadingsHref,
} from '@/lib/qa-method-readings-route';
import { isScripturePracticeEnabled } from '@/lib/scripture-practice-feature';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function QaMethodReadingsDisabled() {
  useEffect(() => {
    clearQaMethodReadingReturn();
  }, []);
  return <Redirect href="/(tabs)/(today)" />;
}

export default function QaMethodReadingsRoute() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ method?: string | string[] }>();
  const enabled = isScripturePracticeEnabled();
  const openingBibleRef = useRef(false);
  const selectedMethodId = normalizeQaMethodParam(firstParam(params.method));

  const closeLibrary = useCallback(() => {
    clearQaMethodReadingReturn();
    router.replace('/(tabs)/(study)');
  }, [router]);

  useFocusEffect(useCallback(() => {
    openingBibleRef.current = false;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedMethodId) router.setParams(qaMethodReadingsHref().params);
      else closeLibrary();
      return true;
    });
    return () => subscription.remove();
  }, [closeLibrary, router, selectedMethodId]));

  const openBible = useCallback((
    example: QaMethodReadingExample,
    passage: QaMethodReadingPassage,
  ) => {
    if (!setQaMethodReadingReturn(example.methodId)) return;
    openingBibleRef.current = true;
    router.navigate(buildQaMethodBibleHref(passage));
  }, [router]);

  useEffect(() => {
    const unsubscribe = navigation.addListener(
      'beforeRemove' as never,
      () => {
        if (!openingBibleRef.current) clearQaMethodReadingReturn();
      },
    );
    return unsubscribe;
  }, [navigation]);

  if (!enabled) {
    return <QaMethodReadingsDisabled />;
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <QaMethodReadingsScreen
        selectedMethodId={selectedMethodId}
        onSelectMethod={(methodId) => {
          router.setParams({ method: methodId });
        }}
        onBackToLibrary={() => {
          router.setParams(qaMethodReadingsHref().params);
        }}
        onClose={closeLibrary}
        onOpenBible={openBible}
      />
    </>
  );
}
