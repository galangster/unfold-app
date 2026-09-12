import {
  normalizeQaMethodParam,
  qaMethodReadingsHref,
} from '../qa-method-readings-route';

describe('qa method readings route helpers', () => {
  it('pushes the library with an explicit empty method param', () => {
    expect(qaMethodReadingsHref()).toEqual({
      pathname: '/qa-method-readings',
      params: { method: '' },
    });
    expect(qaMethodReadingsHref('lectio_divina').params.method).toBe('lectio_divina');
    expect(normalizeQaMethodParam('')).toBeNull();
    expect(normalizeQaMethodParam('  ')).toBeNull();
    expect(normalizeQaMethodParam('lectio_divina')).toBe('lectio_divina');
  });

});
