import { describe, expect, it } from 'vitest';
import { shouldResetSearchOnSourceChange } from './sourceState';

describe('shouldResetSearchOnSourceChange', () => {
  it('resets a query when the active source changes', () => {
    expect(shouldResetSearchOnSourceChange('ytmusic', 'local')).toBe(true);
    expect(shouldResetSearchOnSourceChange('local', 'spotify')).toBe(true);
  });

  it('keeps a query when the same source is selected again', () => {
    expect(shouldResetSearchOnSourceChange('local', 'local')).toBe(false);
    expect(shouldResetSearchOnSourceChange('ytmusic', 'ytmusic')).toBe(false);
  });
});
