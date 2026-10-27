import { persistentAtom } from '@nanostores/persistent';
import type { PackageStatus } from '../components/SettingsView';

export const $textPackageStatus = persistentAtom<PackageStatus>(
  'bibleit_text_status',
  'not_downloaded',
);

export const $aiPackageStatus = persistentAtom<PackageStatus>(
  'bibleit_ai_status',
  'not_downloaded',
);
