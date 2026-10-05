import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Writes an export to the app cache and opens the OS share sheet so the owner can save it to
 * Files / Drive / email. The cached copy is overwritten on the next export of the same name.
 */
export async function saveAndShare(bytes: Uint8Array, fileName: string, mimeType: string): Promise<string> {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  const file = new File(Paths.cache, safeName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: safeName, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text' });
  }
  return file.uri;
}
