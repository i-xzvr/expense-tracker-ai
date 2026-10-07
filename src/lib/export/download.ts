import { ExportFile } from "@/lib/export/serializers";

/** Start a browser download without uploading any expense data. */
export function downloadExportFile(file: ExportFile): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("Downloads are available only in a browser.");
  }

  let objectUrl: string | undefined;
  let anchor: HTMLAnchorElement | undefined;
  try {
    objectUrl = URL.createObjectURL(
      new Blob([file.content], { type: file.mimeType }),
    );
    anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
  } catch (cause) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw new Error("The download could not start. Please try again.", {
      cause,
    });
  } finally {
    anchor?.remove();
  }

  // Give the browser time to consume the Blob before releasing its URL.
  const urlToRelease = objectUrl;
  window.setTimeout(() => URL.revokeObjectURL(urlToRelease), 1_000);
}
