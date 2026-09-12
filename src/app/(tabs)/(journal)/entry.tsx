// Re-export the journal reflection screen so it renders within the Journal tab's stack.
// Mounting it here is what makes its close action resolve to the Journal tab
// rather than the Today tab — see tabRootFromSegments in src/lib/navigation.ts.
export { default } from '../(today)/journal';
