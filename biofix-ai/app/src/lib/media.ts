import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { FilePayload, ImagePayload } from './types';

/** Shrink a picked photo to a JPEG small enough to upload over mobile data. Re-encoding also drops location data. */
async function shrink(a: ImagePicker.ImagePickerAsset, maxSide: number): Promise<ImagePayload | null> {
  const scale = Math.min(1, maxSide / Math.max(a.width || maxSide, a.height || maxSide));
  const ctx = ImageManipulator.manipulate(a.uri);
  if (scale < 1) ctx.resize({ width: Math.round((a.width || maxSide) * scale) });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ base64: true, compress: 0.72, format: SaveFormat.JPEG });
  return out.base64 ? { data: out.base64, mediaType: 'image/jpeg', uri: out.uri } : null;
}

/** Take a photo, or pick one from the gallery. */
export async function pickImage(source: 'camera' | 'library', maxSide = 1280): Promise<ImagePayload | null | 'denied'> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return 'denied';
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;
  return shrink(res.assets[0], maxSide);
}

/** Pick several photos from the gallery at once (fault photos, or the pages of a manual). */
export async function pickImages(max: number, maxSide = 1280): Promise<ImagePayload[] | 'denied'> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return 'denied';
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: max, orderedSelection: true,
  });
  if (res.canceled) return [];
  const out: ImagePayload[] = [];
  for (const a of res.assets.slice(0, max)) {
    const img = await shrink(a, maxSide);
    if (img) out.push(img);
  }
  return out;
}

async function readBase64(a: DocumentPicker.DocumentPickerAsset): Promise<string> {
  // The web picker hands the content over as a data URI; on a phone the file is read from its cached copy.
  return a.base64 ? a.base64.replace(/^data:[^,]*,/, '') : new File(a.uri).base64();
}

function decodeBase64Utf8(b64: string): string {
  const bin = globalThis.atob(b64);
  return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

const isPdf = (a: DocumentPicker.DocumentPickerAsset) => /\.pdf$/i.test(a.name) || a.mimeType === 'application/pdf';

/** Largest attachment the server accepts with a fault report (as base64 characters, about 8 MB of file). */
const MAX_ATTACHMENT = 11_000_000;

/** Pick a PDF or text file (error log, service report, a few manual pages) to attach to a fault report. */
export async function pickAttachment(): Promise<FilePayload | null | 'too_big'> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'application/json', 'text/xml'],
    copyToCacheDirectory: true, base64: true,
  });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  if ((a.size ?? 0) > MAX_ATTACHMENT * 0.74) return 'too_big';
  const data = await readBase64(a);
  if (data.length > MAX_ATTACHMENT) return 'too_big';
  return { name: a.name.slice(0, 120), mediaType: isPdf(a) ? 'application/pdf' : 'text/plain', data };
}

/** Developer panel: pick a manual. Returns base64 for PDFs (read on the server) and plain text otherwise. */
export async function pickManual(): Promise<{ name: string; pdfBase64?: string; text?: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'text/plain', 'text/markdown', 'text/csv'], copyToCacheDirectory: true, base64: true });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const name = a.name.replace(/\.[^.]+$/, '');
  const data = await readBase64(a);
  return isPdf(a) ? { name, pdfBase64: data } : { name, text: decodeBase64Utf8(data) };
}
