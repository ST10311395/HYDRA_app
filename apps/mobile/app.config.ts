import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config. Public (non-secret) values come from EXPO_PUBLIC_* env vars; secrets never
 * belong in the mobile bundle. Permission strings explain *why* each OS permission is requested.
 */
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'PSG Electrical',
  slug: 'hydra-psg-electrical',
  scheme: 'hydra',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0B0F16',
  runtimeVersion: { policy: 'appVersion' },
  ios: {
    bundleIdentifier: 'za.co.psgelectrical.hydra',
    buildNumber: '1',
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSCameraUsageDescription: 'The camera is used to scan the customer’s job QR code on arrival and to photograph work and inspection evidence.',
      NSLocationWhenInUseUsageDescription: 'Your location is recorded only at the moment you confirm arrival on site, as evidence for the job check-in.',
      NSPhotoLibraryUsageDescription: 'Choose photos of the electrical issue or inspection evidence to attach to a job.',
    },
  },
  android: {
    package: 'za.co.psgelectrical.hydra',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#0B0F16',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Least privilege: only what features use. READ_CALL_LOG is added by the isolated missed-call
    // module's config plugin (admin work device builds only — see docs/MISSED_CALLS.md).
    permissions: ['CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.READ_CONTACTS', 'android.permission.ACCESS_BACKGROUND_LOCATION', 'android.permission.SYSTEM_ALERT_WINDOW'],
  },
  web: { output: 'single', favicon: './assets/images/favicon.png' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    ['expo-splash-screen', { backgroundColor: '#0B0F16', image: './assets/images/splash-icon.png', imageWidth: 120 }],
    ['expo-camera', { cameraPermission: 'Allow PSG Electrical to use the camera to scan job QR codes and capture site photos.', microphonePermission: false, recordAudioAndroid: false, barcodeScannerEnabled: true }],
    ['expo-location', { locationWhenInUsePermission: 'Allow PSG Electrical to record your location when you confirm arrival at a job site.' }],
    ['expo-image-picker', { photosPermission: 'Allow PSG Electrical to attach photos to your job requests and inspection reports.', cameraPermission: 'Allow PSG Electrical to take photos of electrical work.', microphonePermission: false }],
    ['expo-notifications', { color: '#2F6BFF', defaultChannel: 'default' }],
    ['expo-build-properties', { android: { minSdkVersion: 24 } }],
    './modules/missed-call-monitor/app.plugin.js',
    ...(googleIosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }] as [string, unknown]] : []),
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    router: {},
  },
  owner: process.env.EXPO_PUBLIC_EAS_OWNER || undefined,
});
