export type SourceId = 'spotify' | 'ytmusic' | 'local';

export function shouldResetSearchOnSourceChange(previousSource: SourceId, nextSource: SourceId): boolean {
  return previousSource !== nextSource;
}
