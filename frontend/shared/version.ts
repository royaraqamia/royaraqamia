import { appVersion } from '@/backend/config/generated/app-version';

const semverOf = (releaseVersion: string) => releaseVersion.split('+')[0] ?? releaseVersion;

export const displayVersion = semverOf(appVersion.releaseVersion);
