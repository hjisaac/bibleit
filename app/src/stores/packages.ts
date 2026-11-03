import { persistentAtom } from '@nanostores/persistent';
import { PackageStatus } from '../core/types';

export const $textPackageStatus = persistentAtom<PackageStatus>(
  'bibleit_text_status',
  PackageStatus.NOT_DOWNLOADED,
);

export const $aiPackageStatus = persistentAtom<PackageStatus>(
  'bibleit_ai_status',
  PackageStatus.NOT_DOWNLOADED,
);

export const $modelPackageStatus = persistentAtom<PackageStatus>(
  'bibleit_model_status',
  PackageStatus.NOT_DOWNLOADED,
);

