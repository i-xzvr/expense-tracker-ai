/** Re-encode selected images to remove metadata and keep local receipt storage small. */
export async function prepareReceiptImage(file: File): Promise<{ dataUrl: string; mimeType: "image/jpeg" }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG, or WebP receipt image.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose a receipt image smaller than 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the receipt image.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    if (dataUrl.length > 1_500_000) throw new Error("This receipt is too large after compression. Try a smaller image.");
    return { dataUrl, mimeType: "image/jpeg" };
  } finally { bitmap.close(); }
}
