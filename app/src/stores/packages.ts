import { persistentAtom } from '@nanostores/persistent';
import { PackageStatusEnum } from '../core/types';

export const $textPackageStatus = persistentAtom<PackageStatusEnum>(
  'bibleit_text_status',
  PackageStatusEnum.NOT_DOWNLOADED,
);

export const $aiPackageStatus = persistentAtom<PackageStatusEnum>(
  'bibleit_ai_status',
  PackageStatusEnum.NOT_DOWNLOADED,
);

export const $modelPackageStatus = persistentAtom<PackageStatusEnum>(
  'bibleit_model_status',
  PackageStatusEnum.NOT_DOWNLOADED,
);

