export function validPhotoSource(src: unknown): src is string {
  return (
    typeof src === 'string' &&
    ((src.length <= 650000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(src)) ||
      /^\/api\/photos\/[a-f0-9]{64}$/.test(src))
  );
}
