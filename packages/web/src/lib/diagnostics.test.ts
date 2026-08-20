import { describe, expect, it } from 'vitest';
import { readDiagnosticEvents } from './diagnostics';

describe('diagnostic event storage', () => {
  it('returns an empty list when browser storage is unavailable', () => {
    expect(readDiagnosticEvents()).toEqual([]);
  });
});
