import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Layers, 
  Megaphone, 
  Check, 
  ChevronRight,
  ArrowLeft,
  Sparkles,
  AlertTriangle
} from "lucide-react";
import { ProductDesignGallery } from "./ProductDesignGallery";
import { ImageTypeSelector, ImageType } from "./ImageTypeSelector";
import { MarketingImageGallery } from "./MarketingImageGallery";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface GeneratedImage {
  id: string;
  image_url: string;
  prompt: string;
  is_selected: boolean;
  feedback: string | null;
  image_type?: string;
  phase?: number;
  parent_image_id?: string | null;
  marketing_copy?: string | null;
}


interface CompetitorProduct {
  id: string;
  product_title?: string;
  product_images?: string[];
  main_image?: string;
  price?: string;
  rating?: number;
}

interface PrdData {
  usageScenario?: string;
  usageScenarios?: string[];
  targetAudience?: string;
  coreFeatures?: string[];
  designStyle?: string;
  selectedDirection?: string;
  referenceImages?: {
    id: string;
    url: string;
    description?: string;
    uploadedAt: string;
  }[];
}

interface VisualGenerationPhaseProps {
  projectId: string;
  productImages: GeneratedImage[];
  marketingImages: GeneratedImage[];
  onProductImagesChange: (images: GeneratedImage[]) => void;
  onMarketingImagesChange: (images: GeneratedImage[]) => void;
  onConfirmAndProceed: () => void;
  prdSummary?: string;
  prdData?: PrdData;
  competitorProducts?: CompetitorProduct[];
  onLandingPageReset?: () => Promise<void>;
  hasLandingPage?: boolean;
}

export function VisualGenerationPhase({
  projectId,
  productImages,
  marketingImages,
  onProductImagesChange,
  onMarketingImagesChange,
  onConfirmAndProceed,
  prdSummary,
  prdData,
  competitorProducts = [],
  onLandingPageReset,
  hasLandingPage = false,
}: VisualGenerationPhaseProps) {
  // 基于已有数据推断初始 phase 状态，确保导航后正确恢复
  const [currentPhase, setCurrentPhase] = useState<1 | 2>(() => {
    const hasSelectedProduct = productImages.some(img => img.is_selected);
    // 有已选产品造型时直接进入 phase 2
    return hasSelectedProduct ? 2 : 1;
  });
  
  const [selectedProductImage, setSelectedProductImage] = useState<GeneratedImage | null>(() => {
    // 初始化时直接找到已选中的产品图
    return productImages.find(img => img.is_selected) || null;
  });
  
  const [showPhaseTransition, setShowPhaseTransition] = useState(false);
  const [selectedImageTypes, setSelectedImageTypes] = useState<ImageType[]>([]);
  
  // State for design change confirmation
  const [showDesignChangeConfirm, setShowDesignChangeConfirm] = useState(false);
  const [pendingDesignChange, setPendingDesignChange] = useState<{
    oldImageId: string;
    newImageId: string;
    resolve: (value: boolean) => void;
  } | null>(null);

  // 追踪是否已经初始化过 phase
  const hasInitializedRef = useRef(false);

  // 监听 productImages 变化，更新 selectedProductImage
  useEffect(() => {
    const selected = productImages.find(img => img.is_selected);
    if (selected) {
      setSelectedProductImage(selected);
      
      // 仅在首次检测到选中图片时自动切换到 phase 2
      // 避免每次 productImages 变化都重置 phase
      if (!hasInitializedRef.current && currentPhase === 1) {
        setCurrentPhase(2);
        hasInitializedRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productImages]); // 移除 currentPhase 依赖，避免循环

  // 当 marketingImages 变化时，如果有数据且有选中产品，确保在 phase 2
  useEffect(() => {
    const hasSelectedProduct = productImages.some(img => img.is_selected);
    if (hasSelectedProduct && marketingImages.length > 0 && currentPhase === 1) {
      setCurrentPhase(2);
    }
  }, [marketingImages.length, productImages, currentPhase]);

  const handleProductSelection = (image: GeneratedImage) => {
    setSelectedProductImage(image);
    setShowPhaseTransition(true);
  };

  const handleConfirmPhaseTransition = () => {
    setShowPhaseTransition(false);
    setCurrentPhase(2);
  };

  const handleBackToPhase1 = () => {
    setCurrentPhase(1);
  };

  // Handle design change - shows confirmation if there are associated assets
  const handleDesignChange = async (oldImageId: string, newImageId: string): Promise<boolean> => {
    // Check if there are associated marketing images
    const totalAssets = marketingImages.length;
    
    if (totalAssets === 0) {
      // No assets to clear, proceed directly
      return true;
    }

    // Show confirmation dialog
    return new Promise((resolve) => {
      setPendingDesignChange({ oldImageId, newImageId, resolve });
      setShowDesignChangeConfirm(true);
    });
  };

  // Confirm design change and clear assets
  const confirmDesignChange = async () => {
    if (!pendingDesignChange) return;
    
    const { oldImageId, resolve } = pendingDesignChange;
    
    try {
      // Delete associated marketing images from database
      const { error: imagesError } = await supabase
        .from("generated_images")
        .delete()
        .eq("parent_image_id", oldImageId);
      
      if (imagesError) {
        console.error("Error deleting marketing images:", imagesError);
      }

      // Clear frontend state
      onMarketingImagesChange([]);
      
      // Reset image type selection
      setSelectedImageTypes([]);

      // Clear landing page if exists
      if (onLandingPageReset) {
        try {
          await onLandingPageReset();
        } catch (e) {
          console.error("Error resetting landing page:", e);
        }
      }
      
      toast.success("已清除旧造型的营销素材和落地页，请重新生成");
      
      resolve(true);
    } catch (error) {
      console.error("Error clearing assets:", error);
      toast.error("清除素材时出错，但可以继续操作");
      
      // Still clear frontend state even if DB deletion failed
      onMarketingImagesChange([]);
      setSelectedImageTypes([]);
      
      resolve(true);
    } finally {
      setShowDesignChangeConfirm(false);
      setPendingDesignChange(null);
    }
  };

  // Cancel design change
  const cancelDesignChange = () => {
    if (pendingDesignChange) {
      pendingDesignChange.resolve(false);
    }
    setShowDesignChangeConfirm(false);
    setPendingDesignChange(null);
  };

  const phases = [
    { id: 1, label: "产品造型设计", icon: Layers },
    { id: 2, label: "营销素材生成", icon: Megaphone },
  ];

  return (
    <div className="space-y-6">
      {/* Phase Indicator */}
      <Card className="glass border-border/50 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {phases.map((phase, index) => (
                <div key={phase.id} className="flex items-center">
                  <motion.button
                    onClick={() => phase.id === 1 && currentPhase === 2 && handleBackToPhase1()}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300",
                      currentPhase === phase.id
                        ? "bg-gradient-to-r from-stage-2 to-accent text-white"
                        : phase.id < currentPhase
                        ? "bg-stage-2/20 text-stage-2 cursor-pointer hover:bg-stage-2/30"
                        : "bg-muted text-muted-foreground"
                    )}
                    whileHover={phase.id < currentPhase ? { scale: 1.02 } : {}}
                    whileTap={phase.id < currentPhase ? { scale: 0.98 } : {}}
                  >
                    {phase.id < currentPhase ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <phase.icon className="w-4 h-4" />
                    )}
                    <span className="text-sm font-medium">{phase.label}</span>
                  </motion.button>
                  
                  {index < phases.length - 1 && (
                    <div className="mx-3 flex items-center">
                      <motion.div
                        className={cn(
                          "h-0.5 w-8 rounded-full",
                          currentPhase > phase.id ? "bg-stage-2" : "bg-border"
                        )}
                        initial={false}
                        animate={{
                          backgroundColor: currentPhase > phase.id 
                            ? "hsl(var(--stage-2))" 
                            : "hsl(var(--border))"
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Current phase hint */}
            <Badge variant="outline" className="bg-background/50">
              {currentPhase === 1 
                ? "生成并选择产品造型" 
                : "生成营销素材"
              }
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Phase Transition Overlay */}
      <AnimatePresence>
        {showPhaseTransition && selectedProductImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/90 backdrop-blur-md z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="max-w-lg w-full"
            >
              <Card className="glass border-stage-2/50 overflow-hidden">
                {/* Confetti effect */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {[...Array(12)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-2 h-2 rounded-full"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        backgroundColor: `hsl(${Math.random() * 60 + 180}, 70%, 60%)`,
                      }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ 
                        scale: [0, 1, 0.5],
                        opacity: [0, 1, 0],
                        y: [0, -30, -50],
                      }}
                      transition={{ 
                        duration: 1.5,
                        delay: i * 0.05,
                        repeat: Infinity,
                        repeatDelay: 2
                      }}
                    />
                  ))}
                </motion.div>

                <CardContent className="p-8 text-center relative">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 25, delay: 0.1 }}
                    className="w-24 h-24 mx-auto mb-6 rounded-xl overflow-hidden border-4 border-stage-2 shadow-lg"
                    style={{ boxShadow: "0 0 30px hsl(var(--stage-2) / 0.4)" }}
                  >
                    <img 
                      src={selectedProductImage.image_url} 
                      alt="Selected design"
                      className="w-full h-full object-cover"
                    />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <h3 className="text-xl font-bold mb-2 flex items-center justify-center gap-2">
                      <Sparkles className="w-5 h-5 text-stage-2" />
                      产品造型已选定！
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      接下来将根据这个造型生成各类营销素材和视频
                    </p>
                  </motion.div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowPhaseTransition(false)}
                      className="flex-1"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      返回修改
                    </Button>
                    <Button
                      onClick={handleConfirmPhaseTransition}
                      className="flex-1 bg-gradient-to-r from-stage-2 to-accent animate-glow-pulse"
                    >
                      进入素材生成
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase Content */}
      <AnimatePresence mode="wait">
        {currentPhase === 1 ? (
          <motion.div
            key="phase1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <ProductDesignGallery
              projectId={projectId}
              images={productImages}
              onImagesChange={onProductImagesChange}
              onSelectImage={handleProductSelection}
              onDesignChange={handleDesignChange}
              prdSummary={prdSummary}
              prdData={prdData}
              competitorProducts={competitorProducts}
              referenceImages={prdData?.referenceImages}
            />
          </motion.div>
        ) : (
          <motion.div
            key="phase2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Selected Product Display */}
            {selectedProductImage && (
              <Card className="glass border-stage-2/30 overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-stage-2 flex-shrink-0">
                      <img 
                        src={selectedProductImage.image_url}
                        alt="Selected product"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Check className="w-4 h-4 text-stage-2" />
                        已选定的产品造型
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        基于此造型生成营销素材
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleBackToPhase1}
                      className="text-muted-foreground"
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" />
                      更换造型
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Image Type Selector */}
            <ImageTypeSelector
              selectedTypes={selectedImageTypes}
              onTypesChange={setSelectedImageTypes}
            />

            {/* Marketing Image Gallery - Pass full prdData */}
            <MarketingImageGallery
              projectId={projectId}
              parentImageId={selectedProductImage?.id}
              parentImageUrl={selectedProductImage?.image_url}
              selectedTypes={selectedImageTypes}
              images={marketingImages}
              onImagesChange={onMarketingImagesChange}
              prdSummary={prdSummary}
              prdData={prdData}
            />


            {/* Proceed to Landing Page */}
            {selectedProductImage && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="glass border-stage-3/50 overflow-hidden relative">
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-stage-2/10 via-stage-3/10 to-stage-2/10"
                    animate={{
                      backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                    }}
                    transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                    style={{ backgroundSize: "200% 100%" }}
                  />
                  
                  <CardContent className="p-6 relative">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-stage-3">
                          准备进入落地页阶段
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          已生成 {marketingImages.length} 张营销图片
                          {marketingImages.length === 0 && (
                            <span>（未生成也可继续，稍后可在落地页阶段补齐/重新生成）</span>
                          )}
                        </p>
                      </div>
                      <Button 
                        onClick={onConfirmAndProceed} 
                        className="bg-gradient-to-r from-stage-2 to-stage-3 hover:opacity-90 transition-opacity animate-glow-pulse"
                        size="lg"
                      >
                        <span className="mr-2">进入落地页阶段</span>
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Design Change Confirmation Dialog */}
      <AlertDialog open={showDesignChangeConfirm} onOpenChange={setShowDesignChangeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              确认更换产品造型？
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>更换产品造型后，以下关联内容将被清除并需要重新生成：</p>
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>已生成的 {marketingImages.length} 张营销素材</li>
                {hasLandingPage && <li>已创建的落地页</li>}
              </ul>
              <p className="text-sm text-muted-foreground pt-2">
                此操作不可撤销，确定要更换吗？
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDesignChange}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDesignChange}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认更换
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
