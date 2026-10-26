
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { uriToArrayBuffer } from '@/lib/upload';

export const AVATAR_BUCKET = 'profile-images';
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const ALLOWED_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
] as const;

export type PickedAvatar = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

/**
 * Opens the device gallery and returns the selected image.
 */
export async function pickAvatarImage(): Promise<PickedAvatar | null> {
  if (Platform.OS !== 'web') {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      throw new Error(
        'Gallery permission was denied. Enable it in your device settings.'
      );
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    allowsMultipleSelection: false,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];

  if (!asset.uri) {
    throw new Error('The selected image could not be read.');
  }

  const mimeType =
    asset.mimeType ??
    (asset.uri.toLowerCase().split('?')[0].endsWith('.png')
      ? 'image/png'
      : asset.uri.toLowerCase().split('?')[0].endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg');

  if (
    !(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)
  ) {
    throw new Error(
      'Unsupported image type. Choose JPEG, PNG, or WebP.'
    );
  }

  const extension =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp'
        ? 'webp'
        : 'jpg';

  const name = `avatar.${extension}`;
  const size = asset.fileSize ?? 0;

  if (size > MAX_AVATAR_BYTES) {
    throw new Error('Choose an image smaller than 5 MB.');
  }

  return { uri: asset.uri, name, mimeType, size };
}

/**
 * Creates a consistent path for the user's avatar.
 */
export function getAvatarPath(
  userId: string,
  extension: string
): string {
  const safeExtension = (
    ALLOWED_EXTENSIONS as readonly string[]
  ).includes(extension.toLowerCase())
    ? extension.toLowerCase()
    : 'jpg';

  return `${userId}/avatar.${safeExtension}`;
}

/**
 * Gets the file extension from a filename or storage path.
 */
export function getAvatarExtension(
  path: string | null | undefined
): string {
  if (!path) return 'jpg';

  const match = /\.([a-zA-Z0-9]+)$/.exec(path.trim());
  const extension = match?.[1]?.toLowerCase();

  if (
    extension &&
    (ALLOWED_EXTENSIONS as readonly string[]).includes(extension)
  ) {
    return extension;
  }

  return 'jpg';
}

/**
 * Uploads or replaces the user's profile photo.
 * The caller updates the profile table with the returned path.
 */
export async function uploadAvatar(
  userId: string,
  image: PickedAvatar
): Promise<{ path: string | null; error: string | null }> {
  try {
    if (!userId) {
      return { path: null, error: 'Please sign in again.' };
    }

    if (
      !(ALLOWED_MIME_TYPES as readonly string[]).includes(
        image.mimeType
      )
    ) {
      return { path: null, error: 'Unsupported image type.' };
    }

    const path = getAvatarPath(
      userId,
      getAvatarExtension(image.name)
    );

    // Read the local file into binary data (fetch() cannot open file:// URIs
    // on native devices).
    let bytes: ArrayBuffer;
    try {
      bytes = await uriToArrayBuffer(image.uri);
    } catch {
      return {
        path: null,
        error: 'Could not read the selected image. Please choose it again.',
      };
    }

    if (bytes.byteLength > MAX_AVATAR_BYTES) {
      return {
        path: null,
        error: 'Choose an image smaller than 5 MB.',
      };
    }

    const { error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, bytes, {
        contentType: image.mimeType,
        upsert: true,
      });

    if (error) {
      return { path: null, error: error.message };
    }

    return { path, error: null };
  } catch (error) {
    return {
      path: null,
      error:
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while uploading the photo.',
    };
  }
}

/**
 * Removes the user's profile photo from storage.
 */
export async function removeAvatarFromStorage(
  _userId: string,
  currentPath: string | null
): Promise<{ error: string | null }> {
  if (!currentPath) return { error: null };

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([currentPath]);

  if (
    error &&
    !error.message.toLowerCase().includes('not found')
  ) {
    return { error: error.message };
  }

  return { error: null };
}

/**
 * Creates a signed URL for a private profile photo.
 */
export async function getAvatarSignedUrl(
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error || !data?.signedUrl) {
    console.error('Could not load profile photo:', error?.message);
    return null;
  }

  return data.signedUrl;
}
