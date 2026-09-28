// Server-only. Call after the application's authentication/authorization checks.
export const MEDIA_PROJECTS = Object.freeze({
  'watt.nathoeng.com': 'temple',
  'nathoeng.com': 'nathoeng',
  'gears.nathoeng.com': 'gears',
  'library.nathoeng.com': 'library',
});
const endpoint = 'https://media.nathoeng.com/upload.php';
const limit = 2 * 1024 * 1024;

export async function uploadPublicImage({ bytes, mime, project = 'temple' }, { env = process.env, fetchImpl = fetch } = {}) {
  if (!Object.values(MEDIA_PROJECTS).includes(project)) throw new Error('Unknown media project');
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > limit) throw new Error('Image must be 1 byte to 2 MiB');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  if (!extension) throw new Error('Only JPEG, PNG and WebP are supported');
  if (env.MEDIA_UPLOAD_URL !== endpoint || typeof env.MEDIA_UPLOAD_KEY !== 'string' || env.MEDIA_UPLOAD_KEY.length < 32) {
    throw new Error('Media upload is not configured');
  }
  const form = new FormData();
  form.set('folder', project);
  form.set('file', new Blob([bytes], { type: mime }), `image.${extension}`);
  let response, data;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'X-Upload-Key': env.MEDIA_UPLOAD_KEY }, body: form,
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000),
    });
    data = await response.json();
  } catch {
    throw new Error('Media service unavailable');
  }
  const pattern = new RegExp(`^https://media\\.nathoeng\\.com/uploads/${project}/[0-9]{4}/(?:0[1-9]|1[0-2])/[a-f0-9]{32}\\.webp$`);
  if (!response.ok || data?.ok !== true || typeof data.url !== 'string' || !pattern.test(data.url)
      || !Number.isInteger(data.bytes) || data.bytes < 1 || data.bytes > limit) {
    throw new Error('Media upload failed or returned invalid metadata');
  }
  return { url: data.url, bytes: data.bytes, mime: 'image/webp' };
}
