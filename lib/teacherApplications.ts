import { supabase } from '@/lib/supabase';
import { contentTypeFromName, uriToArrayBuffer } from '@/lib/upload';

export type TeacherApplicationStatus = 'pending' | 'approved' | 'rejected';

export type TeacherApplication = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  id_image_path: string;
  status: TeacherApplicationStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
};

export async function createTeacherApplication(
  userId: string,
  params: { fullName: string; email: string; imageUri: string }
): Promise<{ application: TeacherApplication | null; error: string | null }> {
  try {
    const fileExt = (
      params.imageUri.split('.').pop()?.split('?')[0] ?? 'jpg'
    ).toLowerCase();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    // Read the local file into binary data (fetch() cannot open file:// URIs
    // on native devices).
    const bytes = await uriToArrayBuffer(params.imageUri);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('teacher-id-images')
      .upload(fileName, bytes, {
        contentType: contentTypeFromName(params.imageUri),
        upsert: false,
      });

    if (uploadError) {
      return { application: null, error: `Image upload failed: ${uploadError.message}` };
    }

    const { data, error } = await supabase
      .from('teacher_applications')
      .insert({
        user_id: userId,
        full_name: params.fullName,
        email: params.email,
        id_image_path: uploadData.path,
      })
      .select()
      .single();

    if (error) {
      await supabase.storage.from('teacher-id-images').remove([uploadData.path]);
      return { application: null, error: `Application failed: ${error.message}` };
    }

    return { application: data as TeacherApplication, error: null };
  } catch (err) {
    return { application: null, error: 'Unexpected error creating application' };
  }
}

export async function getMyTeacherApplication(
  userId: string
): Promise<{ application: TeacherApplication | null; error: string | null }> {
  const { data, error } = await supabase
    .from('teacher_applications')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { application: null, error: error.message };
  return { application: data as TeacherApplication | null, error: null };
}

export async function getTeacherIdSignedUrl(
  path: string,
  expiresIn = 3600
): Promise<{ signedUrl: string | null; error: string | null }> {
  const { data, error } = await supabase.storage
    .from('teacher-id-images')
    .createSignedUrl(path, expiresIn);

  if (error) return { signedUrl: null, error: error.message };
  return { signedUrl: data.signedUrl, error: null };
}