import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePayload } from './types';

/** Pick (or shoot) a photo and shrink it to a JPEG small enough to upload over mobile data. */
export async function pickImage(source: 'camera' | 'library', maxSide = 1280): Promise<ImagePayload | null | 'denied'> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return 'denied';
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const scale = Math.min(1, maxSide / Math.max(a.width || maxSide, a.height || maxSide));
  const ctx = ImageManipulator.manipulate(a.uri);
  if (scale < 1) ctx.resize({ width: Math.round((a.width || maxSide) * scale) });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ base64: true, compress: 0.72, format: SaveFormat.JPEG });
  if (!out.base64) return null;
  return { data: out.base64, mediaType: 'image/jpeg', uri: out.uri };
}

/** Pick a PDF or text manual. Returns base64 for PDFs (parsed on the server) and plain text otherwise. */
export async function pickManual(): Promise<{ name: string; pdfBase64?: string; text?: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'text/plain', 'text/markdown', 'text/csv'], copyToCacheDirectory: true, base64: true });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const name = a.name.replace(/\.[^.]+$/, '');
  const isPdf = /\.pdf$/i.test(a.name) || a.mimeType === 'application/pdf';
  if (isPdf) {
    const b64 = a.base64?.replace(/^data:[^,]+,/, '') ?? (await new File(a.uri).base64());
    return { name, pdfBase64: b64 };
  }
  const text = a.base64 ? decodeBase64Utf8(a.base64.replace(/^data:[^,]+,/, '')) : await new File(a.uri).text();
  return { name, text };
}

function decodeBase64Utf8(b64: string): string {
  const bin = globalThis.atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
