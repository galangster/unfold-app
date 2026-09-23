import { sendAppFeedback } from '../app-feedback';
import { authenticatedFetch } from '../device-credential';
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.1.15', nativeBuildVersion: '298' }));
jest.mock('@/lib/api-config', () => ({ PRIMARY_BACKEND_URL: 'https://example.test', getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })) }));
jest.mock('@/lib/device-credential', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('@/lib/revenuecatClient', () => ({ getRevenueCatSupportId: () => 'fixture-support-id' }));
const fetchMock = authenticatedFetch as jest.Mock;
beforeEach(() => jest.clearAllMocks());
it('sends only the explicit note and disclosed support metadata through existing support delivery', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  await sendAppFeedback('  The next steps help.  ', 'profile');
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe('https://example.test/api/bug-report/email');
  expect(JSON.parse(request.body)).toEqual({
    source: 'app-feedback:profile', label: 'Product feedback', userNote: 'The next steps help.',
    report: { triageSummary: { kind: 'product-feedback', appVersion: '1.1.15', build: '298', platform: 'ios', supportId: 'fixture-support-id' } },
  });
});
it('rejects empty or oversized notes instead of silently truncating them', async () => {
  await expect(sendAppFeedback(' ', 'profile')).rejects.toThrow();
  await expect(sendAppFeedback('x'.repeat(501), 'profile')).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('requires a successful acknowledgement', async () => {
  fetchMock.mockResolvedValue({ ok: false });
  await expect(sendAppFeedback('A note', 'reading-milestone')).rejects.toThrow();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
  await expect(sendAppFeedback('A note', 'reading-milestone')).rejects.toThrow();
});
