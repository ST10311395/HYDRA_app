/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { FilePurpose } from '@hydra/shared';
import { errorMessage } from '../api/client';
import { useUploadFile } from '../api/queries';
import { Icon, Text, colors, noSelect, radius, spacing, toast } from '../design-system';

export interface UploadedPhoto {
  id: string;
  uri: string;
}

interface PickedImage {
  uri: string;
  name: string;
  mimeType: string;
}

/** Mirrors the server's per-purpose rules (apps/api fileService) so obvious rejects fail fast. */
const RULES: Partial<Record<FilePurpose, { mimes: string[]; maxBytes: number }>> = {
  JOB_PHOTO: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], maxBytes: 8 * 1024 * 1024 },
  INSPECTION_EVIDENCE: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], maxBytes: 8 * 1024 * 1024 },
  PROFILE_IMAGE: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 4 * 1024 * 1024 },
  AI_ASSESSMENT_PHOTO: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], maxBytes: 8 * 1024 * 1024 },
};

/** Client-side pre-check: null when acceptable, otherwise the message to show. The server re-validates (magic bytes). */
export function photoProblem(asset: { mimeType?: string | null; fileSize?: number | null }, purpose: FilePurpose): string | null {
  const rule = RULES[purpose];
  if (!rule) return null;
  const mime = (asset.mimeType ?? 'image/jpeg').toLowerCase().replace('image/jpg', 'image/jpeg');
  if (!rule.mimes.includes(mime)) return 'Use a JPG, PNG, WebP or HEIC photo.';
  if (asset.fileSize && asset.fileSize > rule.maxBytes) return `This photo is larger than ${Math.round(rule.maxBytes / 1024 / 1024)} MB. Choose a smaller one.`;
  return null;
}

/**
 * Photo attachment strip. Asks for camera/library permission only when the user taps, uploads
 * immediately (server validates type/size) and returns file IDs for the form. Cancelling, a
 * denied permission or an unavailable camera never throws; a failed upload can be retried
 * without picking the photo again, and the rest of the form is untouched.
 */
export function PhotoPicker({ value, onChange, purpose, max = 6, label = 'Photos' }: { value: UploadedPhoto[]; onChange: (v: UploadedPhoto[]) => void; purpose: FilePurpose; max?: number; label?: string }) {
  const upload = useUploadFile();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<PickedImage | null>(null);
  const working = useRef(false);

  const send = async (img: PickedImage) => {
    try {
      const f = await upload.mutateAsync({ uri: img.uri, name: img.name, mimeType: img.mimeType, purpose });
      onChange([...value, { id: f.id, uri: img.uri }]);
      setFailed(null);
    } catch (e) {
      setFailed(img);
      toast.error(errorMessage(e));
    }
  };

  const run = async (task: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await task();
    } catch {
      toast.error('The camera or photo library could not be opened on this device.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const add = (source: 'camera' | 'library') =>
    run(async () => {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.error(
          source === 'camera'
            ? perm.canAskAgain ? 'Camera permission is needed to take a photo.' : 'Camera access is off for PSG Electrical — enable it in your phone settings.'
            : perm.canAskAgain ? 'Photo access is needed to attach an image.' : 'Photo access is off for PSG Electrical — enable it in your phone settings.',
        );
        return;
      }
      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ['images'] })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'], selectionLimit: 1 });
      const asset = res.canceled ? null : res.assets[0];
      if (!asset) return; // cancelled: nothing changes
      const problem = photoProblem(asset, purpose);
      if (problem) {
        toast.error(problem);
        return;
      }
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const ext = mimeType.includes('png') ? 'png' : mimeType.includes('heic') ? 'heic' : mimeType.includes('webp') ? 'webp' : 'jpg';
      await send({ uri: asset.uri, name: asset.fileName ?? `photo.${ext}`, mimeType });
    });

  return (
    <View style={{ gap: 8 }}>
      <Text variant="title" weight="bold">{label}</Text>
      <View style={styles.row}>
        {value.map((p) => (
          <View key={p.id}>
            <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel="Attached photo" />
            <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => onChange(value.filter((x) => x.id !== p.id))} style={styles.remove} hitSlop={8}>
              <Icon name="x" size={12} color="white" />
            </Pressable>
          </View>
        ))}
        {failed ? (
          <View>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry photo upload" disabled={busy} onPress={() => void run(() => send(failed))} style={[styles.thumbFailed, noSelect]}>
              <Image source={{ uri: failed.uri }} style={[styles.thumb, { opacity: 0.4 }]} contentFit="cover" />
              <View style={styles.retry}><Icon name="refresh-cw" size={18} color="warning" /><Text variant="caption" color="warning">Retry</Text></View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Discard failed photo" onPress={() => setFailed(null)} style={styles.remove} hitSlop={8}>
              <Icon name="x" size={12} color="white" />
            </Pressable>
          </View>
        ) : null}
        {value.length < max && !failed ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Take a photo" accessibilityState={{ busy }} disabled={busy} onPress={() => void add('camera')} style={[styles.add, noSelect]}>
              <Icon name={busy ? 'loader' : 'camera'} size={20} color="primaryBright" />
              <Text variant="caption" color="textMuted">{busy ? 'Uploading…' : 'Camera'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose a photo" disabled={busy} onPress={() => void add('library')} style={[styles.add, noSelect]}>
              <Icon name="image" size={20} color="primaryBright" />
              <Text variant="caption" color="textMuted">Gallery</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      {RULES[purpose] ? <Text variant="caption" color="textFaint">Up to {max} photos · max {Math.round(RULES[purpose].maxBytes / 1024 / 1024)} MB each</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { width: 76, height: 76, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  thumbFailed: { width: 76, height: 76 },
  retry: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 2 },
  remove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  add: { width: 76, height: 76, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primaryBorder, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.surfaceInset },
});
