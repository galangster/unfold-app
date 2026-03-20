// Re-export the journal reflection screen so it renders within the Journal tab's stack.
// This ensures router.back() returns to the Journal tab (not the Today tab).
export { default } from '../(today)/journal';
