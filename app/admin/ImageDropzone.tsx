"use client";

import { useRef } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import Image from "next/image";
import Button from "@/components/Button";

type Props = {
  imageUrl: string;
  uploading: boolean;
  onFileSelect: (file: File) => void;
};

export default function ImageDropzone({ imageUrl, uploading, onFileSelect }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) onFileSelect(file);
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Изображение</label>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
      {imageUrl ? (
        <div
          className="relative w-full aspect-square max-w-50 bg-gray-100 rounded-xl overflow-hidden group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <Image src={imageUrl} alt="" fill sizes="200px" className="object-contain p-3" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg shadow"
            >
              {uploading ? "Загрузка..." : "Заменить"}
            </Button>
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-green-700" />
            </div>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          className="w-full aspect-video max-h-48 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-green-600 hover:text-green-700 transition-colors hover:cursor-pointer select-none"
        >
          {uploading ? (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-green-700" />
              <span className="text-sm text-green-700">Загрузка...</span>
            </>
          ) : (
            <>
              <ImagePlus className="w-8 h-8" />
              <span className="text-sm font-medium">Нажмите или перетащите</span>
              <span className="text-xs">PNG, JPG, WebP</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
