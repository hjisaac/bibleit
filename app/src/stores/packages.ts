import { persistentAtom } from '@nanostores/persistent';
import { PackageStatusEnum } from '../core/types';

export const $textPackageStatus = persistentAtom<PackageStatusEnum>(
  'bibleit:status:text',
  PackageStatusEnum.NOT_DOWNLOADED,
);

export const $aiPackageStatus = persistentAtom<PackageStatusEnum>(
  'bibleit:status:ai',
  PackageStatusEnum.NOT_DOWNLOADED,
);

export const $modelPackageStatus = persistentAtom<PackageStatusEnum>(
  'bibleit:status:model',
  PackageStatusEnum.NOT_DOWNLOADED,
);

export const $slmPackageStatus = persistentAtom<PackageStatusEnum>(
  'bibleit:status:slm',
  PackageStatusEnum.NOT_DOWNLOADED,
);

