import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import { authenticatedFetch } from '@/lib/device-credential';
import { getRevenueCatSupportId } from '@/lib/revenuecatClient';
import { APP_FEEDBACK_MAX_LENGTH } from '@/lib/app-feedback-policy';

export type AppFeedbackSource = 'profile' | 'reading-milestone';

export async function sendAppFeedback(note: string, source: AppFeedbackSource): Promise<void> {
  const userNote = note.trim();
  if (!userNote || userNote.length > APP_FEEDBACK_MAX_LENGTH) throw new Error('Invalid feedback length');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await authenticatedFetch(`${PRIMARY_BACKEND_URL}/api/bug-report/email`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        source: `app-feedback:${source}`,
        label: 'Product feedback',
        userNote,
        report: { triageSummary: {
          kind: 'product-feedback',
          appVersion: Application.nativeApplicationVersion,
          build: Application.nativeBuildVersion,
          platform: Platform.OS,
          supportId: getRevenueCatSupportId(),
        } },
      }),
    });
    if (!response.ok || (await response.json()).success !== true) throw new Error('Feedback was not accepted');
  } finally {
    clearTimeout(timeout);
  }
}
