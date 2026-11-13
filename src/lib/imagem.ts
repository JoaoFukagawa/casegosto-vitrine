// Reduz a foto no navegador antes de enviar ao Storage: foto de celular tem 3–8 MB
// (o bucket aceita até 5 MB) e deixaria o cardápio online lento no 4G.
// Resultado: JPEG com o lado maior <= maxLado, normalmente 80–200 KB.

export const FOTO_MAX_LADO = 1200;
const LIMITE_BUCKET = 5 * 1024 * 1024;

async function decodificar(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    // imageOrientation "from-image" respeita a rotação EXIF (foto em pé do celular).
    return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function medidasReduzidas(largura: number, altura: number, maxLado = FOTO_MAX_LADO) {
  const escala = Math.min(1, maxLado / Math.max(largura, altura));
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

export async function comprimirFoto(file: File, maxLado = FOTO_MAX_LADO, qualidade = 0.82): Promise<Blob> {
  let img: Awaited<ReturnType<typeof decodificar>>;
  try {
    img = await decodificar(file);
  } catch {
    // Formato que o navegador não abre (ex.: HEIC no Windows): manda o original se couber.
    if (file.size <= LIMITE_BUCKET) return file;
    throw new Error("Não consegui abrir essa foto. Tente tirar um print dela ou salvar como JPG.");
  }
  const { largura, altura } = medidasReduzidas(img.width, img.height, maxLado);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#fff"; // PNG com transparência não fica preto no JPEG
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(img, 0, 0, largura, altura);
  if ("close" in img && typeof img.close === "function") img.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", qualidade));
  if (!blob) return file;
  return blob.size < file.size ? blob : file;
}
