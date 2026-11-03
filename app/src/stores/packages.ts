import { persistentAtom } from '@nanostores/persistent';
import { PackageStatus } from '../core/types';

export const $textPackageStatus = persistentAtom<PackageStatus>(
  'bibleit_text_status',
  PackageStatus.NotDownloaded,
);

export const $aiPackageStatus = persistentAtom<PackageStatus>(
  'bibleit_ai_status',
  PackageStatus.NotDownloaded,
);

export const $modelPackageStatus = persistentAtom<PackageStatus>(
  'bibleit_model_status',
  PackageStatus.NotDownloaded,
);

