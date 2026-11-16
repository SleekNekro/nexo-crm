// Decode and re-encode locally: downsize uploads and discard original metadata.
export async function prepareSitePhoto(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024)
    throw Error('La foto supera los 20 MB. Selecciona una copia más pequeña.');
  const heic = /\.hei[cf]$/i.test(file.name) || ['image/heic', 'image/heif'].includes(file.type);
  if (heic) {
    try {
      const { heicTo } = await import('heic-to/csp');
      const converted = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.85 });
      file = new File([converted], file.name.replace(/\.hei[cf]$/i, '.jpg'), {
        type: 'image/jpeg',
      });
    } catch {
      throw Error('No se pudo convertir esta foto HEIC. Prueba otra imagen o una copia JPG.');
    }
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw Error('Usa fotos JPG, PNG, WebP, HEIC o HEIF.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('No se puede preparar la foto');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let src = canvas.toDataURL('image/jpeg', 0.78);
    if (src.length > 650000) src = canvas.toDataURL('image/jpeg', 0.5);
    if (src.length > 650000) {
      const small = document.createElement('canvas');
      small.width = Math.round(canvas.width * 0.65);
      small.height = Math.round(canvas.height * 0.65);
      small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
      src = small.toDataURL('image/jpeg', 0.5);
    }
    if (src.length > 650000)
      throw Error('La foto sigue siendo demasiado grande. Usa una imagen de menor resolución.');
    return src;
  } finally {
    URL.revokeObjectURL(url);
  }
}
