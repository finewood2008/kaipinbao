import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut,
  Check,
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LightboxImage {
  id: string;
  image_url: string;
  prompt: string;
  is_selected: boolean;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (imageId: string) => void;
  onNavigate: (index: number) => void;
}

export function ImageLightbox({
  images,
  currentIndex,
  isOpen,
  onClose,
  onSelect,
  onNavigate,
}: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const currentImage = images[currentIndex];

  // Reset zoom when image changes
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [currentIndex]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 3));
  const handleZoomOut = () => {
    setZoom((z) => {
      const newZoom = Math.max(z - 0.5, 1);
      if (newZoom === 1) setPosition({ x: 0, y: 0 });
      return newZoom;
    });
  };

  const handleSelect = useCallback(() => {
    if (!currentImage || !onSelect) return;
    onSelect(currentImage.id);
    setShowConfirmation(true);
    setTimeout(() => {
      setShowConfirmation(false);
      onClose();
    }, 1500);
  }, [currentImage, onSelect, onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          if (currentIndex > 0) onNavigate(currentIndex - 1);
          break;
        case "ArrowRight":
          if (currentIndex < images.length - 1) onNavigate(currentIndex + 1);
          break;
        case "Enter":
          handleSelect();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex, images.length, onClose, onNavigate, handleSelect]);

  const handleDownload = () => {
    if (!currentImage) return;
    const link = document.createElement("a");
    link.href = currentImage.image_url;
    link.download = `product-design-${currentIndex + 1}.png`;
    link.click();
  };

  if (!currentImage) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-background/95 backdrop-blur-xl z-50 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {currentIndex + 1} / {images.length}
              </span>
              {currentImage.is_selected && (
                <span className="flex items-center gap-1 text-sm text-stage-2 bg-stage-2/10 px-2 py-1 rounded-full">
                  <Check className="w-3 h-3" />
                  已选择
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleZoomOut} disabled={zoom <= 1}>
                <ZoomOut className="w-5 h-5" />
              </Button>
              <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" onClick={handleZoomIn} disabled={zoom >= 3}>
                <ZoomIn className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDownload}>
                <Download className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Main image area */}
          <div 
            className="flex-1 relative flex items-center justify-center overflow-hidden"
            onMouseDown={() => zoom > 1 && setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onMouseMove={(e) => {
              if (isDragging && zoom > 1) {
                setPosition((p) => ({
                  x: p.x + e.movementX,
                  y: p.y + e.movementY,
                }));
              }
            }}
          >
            {/* Navigation arrows */}
            {currentIndex > 0 && (
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute left-4 z-10 p-3 rounded-full bg-card/80 backdrop-blur border border-border/50 hover:bg-card transition-colors"
                onClick={() => onNavigate(currentIndex - 1)}
              >
                <ChevronLeft className="w-6 h-6" />
              </motion.button>
            )}
            
            {currentIndex < images.length - 1 && (
              <motion.button
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute right-4 z-10 p-3 rounded-full bg-card/80 backdrop-blur border border-border/50 hover:bg-card transition-colors"
                onClick={() => onNavigate(currentIndex + 1)}
              >
                <ChevronRight className="w-6 h-6" />
              </motion.button>
            )}

            {/* Image */}
            <motion.img
              key={currentImage.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ 
                opacity: 1, 
                scale: zoom,
                x: position.x,
                y: position.y
              }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              src={currentImage.image_url}
              alt="Product design"
              className={cn(
                "max-h-[70vh] max-w-[90vw] object-contain rounded-lg shadow-2xl",
                zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
              )}
              onClick={() => zoom === 1 && handleZoomIn()}
              draggable={false}
            />

            {/* Selection confirmation overlay */}
            <AnimatePresence>
              {showConfirmation && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-0 flex items-center justify-center bg-stage-2/20 backdrop-blur-sm"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    className="w-24 h-24 rounded-full bg-stage-2 flex items-center justify-center shadow-lg"
                    style={{ boxShadow: "0 0 60px hsl(var(--stage-2) / 0.6)" }}
                  >
                    <Check className="w-12 h-12 text-white" />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer with actions */}
          {onSelect && (
            <div className="p-4 border-t border-border/50 flex items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={handleSelect}
                disabled={currentImage.is_selected}
                className={cn(
                  "min-w-[200px]",
                  currentImage.is_selected 
                    ? "bg-stage-2/20 text-stage-2 border border-stage-2"
                    : "bg-gradient-to-r from-stage-2 to-stage-2/80"
                )}
              >
                {currentImage.is_selected ? (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    已选择此设计
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    选择此设计方案
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Thumbnail strip */}
          {images.length > 1 && (
            <div className="p-4 border-t border-border/50 overflow-x-auto">
              <div className="flex gap-2 justify-center min-w-min">
                {images.map((img, idx) => (
                  <motion.button
                    key={img.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onNavigate(idx)}
                    className={cn(
                      "relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all shrink-0",
                      idx === currentIndex 
                        ? "border-primary ring-2 ring-primary/30" 
                        : "border-border/50 hover:border-border"
                    )}
                  >
                    <img
                      src={img.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    {img.is_selected && (
                      <div className="absolute inset-0 bg-stage-2/30 flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
