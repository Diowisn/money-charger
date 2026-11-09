const MAKS_SISI_GAMBAR = 1600;

/** Perkecil foto struk sebelum upload supaya proses AI lebih cepat dan hemat kuota. */
export async function kompresGambar(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const skala = Math.min(1, MAKS_SISI_GAMBAR / Math.max(bitmap.width, bitmap.height));
    if (skala === 1 && file.size < 1_500_000) {
      bitmap.close();
      return file;
    }
    const kanvas = document.createElement("canvas");
    kanvas.width = Math.round(bitmap.width * skala);
    kanvas.height = Math.round(bitmap.height * skala);
    const ctx = kanvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, kanvas.width, kanvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((selesai) => kanvas.toBlob(selesai, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function fileKeAvatar(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Pilih foto JPG, PNG, atau WEBP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Ukuran foto maksimal 8 MB.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca foto."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Foto tidak bisa dibuka."));
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung pengolahan foto.");
  const skala = Math.max(size / image.width, size / image.height);
  const lebar = image.width * skala;
  const tinggi = image.height * skala;
  ctx.drawImage(image, (size - lebar) / 2, (size - tinggi) / 2, lebar, tinggi);
  return canvas.toDataURL("image/jpeg", 0.82);
}
