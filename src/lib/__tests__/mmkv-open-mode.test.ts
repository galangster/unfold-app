import { resolveMmkvOpenPlan } from '../mmkv-open-mode';

describe('resolveMmkvOpenPlan', () => {
  it('row 1 - encrypted marker, key available → encrypted mode, no writeMarker, no recrypt', () => {
    const plan = resolveMmkvOpenPlan('encrypted', true);
    expect(plan).toEqual({ mode: 'encrypted', writeMarker: null, recrypt: false, clearOnOpen: false });
  });

  it('row 2 - encrypted marker, key unavailable → recovery mode, no writeMarker, no recrypt', () => {
    const plan = resolveMmkvOpenPlan('encrypted', false);
    expect(plan).toEqual({ mode: 'recovery', writeMarker: null, recrypt: false, clearOnOpen: true });
  });

  it('row 3 - plain marker, key available → plain mode, writeMarker encrypted, recrypt true', () => {
    const plan = resolveMmkvOpenPlan('plain', true);
    expect(plan).toEqual({ mode: 'plain', writeMarker: 'encrypted', recrypt: true, clearOnOpen: false });
  });

  it('row 4 - plain marker, key unavailable → plain mode, no writeMarker, no recrypt', () => {
    const plan = resolveMmkvOpenPlan('plain', false);
    expect(plan).toEqual({ mode: 'plain', writeMarker: null, recrypt: false, clearOnOpen: false });
  });

  it('row 5 - null marker (legacy), key available → encrypted mode, writeMarker encrypted, no recrypt', () => {
    const plan = resolveMmkvOpenPlan(null, true);
    expect(plan).toEqual({ mode: 'encrypted', writeMarker: 'encrypted', recrypt: false, clearOnOpen: false });
  });

  it('row 6 - null marker (legacy), key unavailable → plain mode, writeMarker plain, no recrypt', () => {
    const plan = resolveMmkvOpenPlan(null, false);
    expect(plan).toEqual({ mode: 'plain', writeMarker: 'plain', recrypt: false, clearOnOpen: false });
  });
});
