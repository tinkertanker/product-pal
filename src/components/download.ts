function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Hand a text file to the browser's download. */
export function downloadText(filename: string, text: string, type = 'text/markdown;charset=utf-8'): void {
  saveBlob(filename, new Blob([text], { type }));
}

export function downloadBytes(filename: string, data: Uint8Array, type = 'application/zip'): void {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  saveBlob(filename, new Blob([copy], { type }));
}
