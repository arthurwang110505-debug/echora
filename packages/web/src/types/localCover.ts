// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/types/localCover.ts
//
// Kept deliberately close to upstream: Echora changes are marked with an "Echora note:".

// src/types/localCover.ts
// Defines content-addressed local cover records independently from local-song metadata.

export type LocalCoverSourceKind = 'folder' | 'embedded';

export type LocalCoverAssetBackend = 'electron' | 'opfs';

export interface LocalCoverAsset {
  id: string;
  mimeType: string;
  size: number;
  createdAt: number;
  backend?: LocalCoverAssetBackend;
  migratedAt?: number;
  blob?: Blob; // Legacy v0.9 migration input; new writes never persist this field.
}

export interface LocalCoverPayload {
  assetId: string;
  blob: Blob;
}
