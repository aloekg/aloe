"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import Button from "@/components/Button";
import { uploadDescriptionImage } from "./actions";

type Props = {
  /** Receives the Markdown to place at the caret, e.g. `![](https://…)`. */
  onInsert: (markdown: string) => void;
};

/**
 * Puts an image into a product description without leaving the editor.
 *
 * Alt text is left empty rather than guessed from the file name: these are usually icons and
 * spec diagrams, and `![DSC_0042.jpg](…)` reads worse to a screen reader than no alt at all. The
 * caret lands between the brackets so it can be typed straight away.
 */
export default function DescriptionImageButton({ onInsert }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadDescriptionImage(fd);
      if (!result.ok) return setError(result.error);
      onInsert(`![](${result.url})`);
    } catch {
      setError("Не удалось загрузить изображение");
    } finally {
      setUploading(false);
      // Let the same file be picked again after a failure.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <Button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1 text-xs text-green-700 hover:text-green-800 disabled:text-gray-500"
      >
        <ImagePlus className="w-3.5 h-3.5" />
        {uploading ? "Загрузка..." : "Вставить картинку"}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </span>
  );
}
