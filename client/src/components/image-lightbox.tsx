import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageLightbox({ src, alt = "Image", isOpen, onClose }: ImageLightboxProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-[101] h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </Button>

      {/* Image container */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />
      </div>
    </div>
  );
}

// Hook to manage lightbox state
export function useLightbox() {
  const [lightboxState, setLightboxState] = useState<{
    isOpen: boolean;
    src: string;
    alt?: string;
  }>({
    isOpen: false,
    src: "",
    alt: "",
  });

  const openLightbox = (src: string, alt?: string) => {
    setLightboxState({ isOpen: true, src, alt });
  };

  const closeLightbox = () => {
    setLightboxState((prev) => ({ ...prev, isOpen: false }));
  };

  return {
    lightboxState,
    openLightbox,
    closeLightbox,
  };
}

