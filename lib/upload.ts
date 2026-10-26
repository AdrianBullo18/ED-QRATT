import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Reads a local image URI into an ArrayBuffer for Supabase Storage upload.
 *
 * React Native's fetch() cannot resolve `file://` URIs, so on native devices
 * the file is read through expo-file-system instead. On web the URI is a
 * blob:/http(s): URL, where fetch works as usual.
 */
export async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error('Could not read the selected image.');
    }
    return await response.arrayBuffer();
  }

  return new File(uri).arrayBuffer();
}

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
};

/**
 * Best-effort MIME type from a file name or storage path. Storage buckets
 * validate against their allowed_mime_types, so a wrong guess surfaces as an
 * upload rejection rather than a corrupt object.
 */
export function contentTypeFromName(name: string): string {
  const clean = name.split('?')[0].toLowerCase();
  const extension = clean.includes('.') ? clean.split('.').pop() ?? '' : '';
  return EXTENSION_CONTENT_TYPES[extension] ?? 'image/jpeg';
}
