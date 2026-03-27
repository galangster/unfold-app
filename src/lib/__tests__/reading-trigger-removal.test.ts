/**
 * Regression test: verify that reading.tsx no longer calls triggerNextDayGeneration
 * from handleComplete, but DOES still call it from handleContinueJourney and handleRetryGeneration.
 *
 * This is a source code assertion test — it reads the file and checks for the pattern.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('reading.tsx trigger removal', () => {
  const readingSource = fs.readFileSync(
    path.join(__dirname, '../../app/(tabs)/(today)/reading.tsx'),
    'utf-8'
  );

  it('does NOT call triggerNextDayGeneration inside handleComplete', () => {
    // Extract handleComplete function body
    const handleCompleteMatch = readingSource.match(
      /const handleComplete = useCallback\(\(\) => \{([\s\S]*?)\}, \[/
    );
    expect(handleCompleteMatch).toBeTruthy();
    const handleCompleteBody = handleCompleteMatch![1];
    expect(handleCompleteBody).not.toContain('triggerNextDayGeneration(');
  });

  it('DOES call triggerNextDayGeneration inside handleContinueJourney', () => {
    // Extract handleContinueJourney body and verify it contains the call
    const handleContinueMatch = readingSource.match(
      /const handleContinueJourney = useCallback\(async \(\) => \{([\s\S]*?)\}, \[/
    );
    expect(handleContinueMatch).toBeTruthy();
    expect(handleContinueMatch![1]).toContain('triggerNextDayGeneration(');
  });

  it('DOES call triggerNextDayGeneration inside handleRetryGeneration', () => {
    // handleRetryGeneration is defined as a useCallback — find it and verify the call
    const handleRetryMatch = readingSource.match(
      /handleRetryGeneration[\s\S]*?triggerNextDayGeneration\(/
    );
    expect(handleRetryMatch).toBeTruthy();
  });
});
