import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MapPin, 
  Users, 
  Palette, 
  Zap, 
  Check, 
  Circle, 
  Image as ImageIcon, 
  Tag, 
  DollarSign, 
  Lightbulb,
  Pencil,
  X,
  ArrowRight,
  Asterisk,
  FileText,
  ImagePlus,
  Loader2
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ReferenceImage {
  id: string;
  url: string;
  description?: string;
  uploadedAt: string;
}

export interface DesignStyleDetails {
  overallStyle?: string | null;
  colorTone?: string | null;
  surfaceTexture?: string | null;
  shapeLanguage?: string | null;
  inspirationKeywords?: string[] | null;
  materialPreference?: string[] | null;
  avoidElements?: string[] | null;
}

export interface CoreFeatureDetail {
  feature: string;
  description: string;
  userBenefit: string;
  technicalApproach?: string;
  priority: "must-have" | "important" | "nice-to-have";
}

export interface PrdData {
  // Core fields
  usageScenario?: string | null;
  targetAudience?: string | null;
  designStyle?: string | null;
  coreFeatures?: string[] | null;
  pricingRange?: string | null;
  painPoints?: string[] | null;
  sellingPoints?: string[] | null;
  
  // Enhanced fields
  productName?: string | null;
  productTagline?: string | null;
  productCategory?: string | null;
  dialoguePhase?: "direction-exploration" | "direction-confirmed" | "details-refinement" | "prd-ready";
  selectedDirection?: string | null;
  
  // NEW: Enhanced design style details
  designStyleDetails?: DesignStyleDetails | null;
  
  // NEW: Enhanced core features details
  coreFeaturesDetails?: CoreFeatureDetail[] | null;
  
  // NEW: User uploaded reference images
  referenceImages?: ReferenceImage[] | null;
  
  // Specifications
  specifications?: {
    dimensions?: string | null;
    weight?: string | null;
    materials?: string[] | null;
    colors?: string[] | null;
    powerSource?: string | null;
    connectivity?: string | null;
  } | null;
  
  // CMF Design
  cmfDesign?: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
    surfaceFinish?: string | null;
    textureDetails?: string | null;
    materialBreakdown?: { material: string; percentage: number; location: string }[] | null;
  } | null;
  
  // User Experience
  userExperience?: {
    unboxingExperience?: string | null;
    firstUseFlow?: string[] | null;
    dailyUseScenarios?: string[] | null;
    painPointsSolved?: { painPoint: string; solution: string }[] | null;
  } | null;
  
  // Feature Matrix
  featureMatrix?: {
    feature: string;
    priority: "must-have" | "important" | "nice-to-have";
    painPointAddressed: string;
    differentiator: string;
    implementationNote: string;
  }[] | null;
  
  // Market Positioning
  marketPositioning?: {
    priceTier?: "budget" | "mid-range" | "premium" | "luxury";
    primaryCompetitors?: string[] | null;
    uniqueSellingPoints?: string[] | null;
    competitiveAdvantages?: string[] | null;
    targetMarketSize?: string | null;
  } | null;
  
  // Packaging
  packaging?: {
    packageType?: string | null;
    includedAccessories?: string[] | null;
    specialPackagingFeatures?: string | null;
    sustainabilityFeatures?: string | null;
  } | null;
  
  marketAnalysis?: {
    competitorCount?: number | null;
    priceRange?: string | null;
    marketTrends?: string[] | null;
    differentiationOpportunity?: string | null;
  };
  marketingAssets?: {
    sceneDescription?: string | null;
    structureHighlights?: string[] | null;
    explodedComponents?: string[] | null;
    usageScenarios?: string[] | null;
    lifestyleContext?: string | null;
  };
  videoAssets?: {
    storyLine?: string | null;
    keyActions?: string[] | null;
    emotionalTone?: string | null;
  };
  competitorInsights?: {
    positivePoints?: string[] | null;
    negativePoints?: string[] | null;
    differentiationStrategy?: string | null;
  };
}

interface CompetitorProduct {
  id: string;
  product_title?: string;
  product_images?: string[];
  main_image?: string;
}

interface PrdExtractionSidebarProps {
  prdData: PrdData | null;
  competitorProducts?: CompetitorProduct[];
  referenceImages?: ReferenceImage[];
  className?: string;
  isEditable?: boolean;
  onFieldEdit?: (field: string, value: unknown) => void;
  onProceedToDesign?: () => void;
  onOpenPrdDocument?: () => void;
  onImageRemove?: (imageId: string) => void;
  onImageUpload?: (file: File) => Promise<void>;
  isUploadingImage?: boolean;
  projectId?: string;
}

const progressItems = [
  { key: "selectedDirection", label: "产品方向", icon: Lightbulb, placeholder: "例如：智能便携方向、专业高端路线" },
  { key: "usageScenario", label: "使用场景", icon: MapPin, placeholder: "例如：户外露营、办公室使用" },
  { key: "targetAudience", label: "目标用户", icon: Users, placeholder: "例如：25-35岁都市白领、户外爱好者" },
  { key: "designStyle", label: "外观风格", icon: Palette, placeholder: "例如：极简北欧风、科技感、复古风" },
  { key: "coreFeatures", label: "核心功能", icon: Zap, placeholder: "每行一个功能，例如：\n快速加热\n智能温控\n便携设计", isArray: true },
  { key: "pricingRange", label: "定价策略", icon: DollarSign, placeholder: "例如：中高端 ¥299-399" },
] as const;

// Helper to safely convert any value to a displayable string
function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(safeStringify).filter(Boolean).join("、");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Handle known user profile fields
    const parts: string[] = [];
    if (obj.age) parts.push(String(obj.age));
    if (obj.occupation) parts.push(String(obj.occupation));
    if (obj.income) parts.push(String(obj.income));
    if (obj.lifestyle) parts.push(String(obj.lifestyle));
    if (parts.length > 0) return parts.join("、");
    
    // Fallback: join all string values
    return Object.values(obj)
      .filter(v => typeof v === "string" || typeof v === "number")
      .map(String)
      .join("、");
  }
  return String(value);
}

// Helper function to get display value for progress item
function getDisplayValue(prdData: PrdData | null, key: string): string | null {
  if (!prdData) return null;
  
  switch (key) {
    case "coreFeatures":
      return prdData.coreFeatures?.slice(0, 3).join("、") || null;
    case "selectedDirection":
      return prdData.selectedDirection || null;
    default: {
      const value = prdData[key as keyof PrdData];
      return safeStringify(value) || null;
    }
  }
}

// Helper function to check if progress item is completed
function isItemCompleted(prdData: PrdData | null, key: string): boolean {
  if (!prdData) return false;
  
  switch (key) {
    case "coreFeatures":
      return !!(prdData.coreFeatures && prdData.coreFeatures.length > 0);
    case "selectedDirection":
      return !!prdData.selectedDirection;
    default:
      return !!prdData[key as keyof PrdData];
  }
}

// Get phase label
function getPhaseLabel(phase: string | undefined): { label: string; color: string } {
  switch (phase) {
    case "direction-exploration":
      return { label: "探索方向", color: "bg-blue-500/20 text-blue-400" };
    case "direction-confirmed":
      return { label: "方向已确认", color: "bg-yellow-500/20 text-yellow-400" };
    case "details-refinement":
      return { label: "细化细节", color: "bg-orange-500/20 text-orange-400" };
    case "prd-ready":
      return { label: "定义完成", color: "bg-green-500/20 text-green-400" };
    default:
      return { label: "开始对话", color: "bg-muted text-muted-foreground" };
  }
}

export function PrdExtractionSidebar({
  prdData,
  competitorProducts = [],
  referenceImages = [],
  className,
  isEditable = false,
  onFieldEdit,
  onProceedToDesign,
  onOpenPrdDocument,
  onImageRemove,
  onImageUpload,
  isUploadingImage = false,
  projectId,
}: PrdExtractionSidebarProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [localIsUploading, setLocalIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const completedCount = progressItems.filter((item) => 
    isItemCompleted(prdData, item.key)
  ).length;

  const progressPercent = (completedCount / progressItems.length) * 100;
  const phase = getPhaseLabel(prdData?.dialoguePhase);
  const isAllCompleted = completedCount === progressItems.length;

  // Get competitor images
  const competitorImages = competitorProducts
    .flatMap((p) => {
      const images = p.product_images || [];
      if (p.main_image && !images.includes(p.main_image)) {
        return [p.main_image, ...images];
      }
      return images;
    })
    .slice(0, 6);

  const handleEditClick = (key: string) => {
    if (!isEditable) return;
    
    const currentValue = prdData?.[key as keyof PrdData];
    if (key === "coreFeatures" && Array.isArray(currentValue)) {
      setEditValue(currentValue.join("\n"));
    } else {
      setEditValue(typeof currentValue === "string" ? currentValue : "");
    }
    setEditingField(key);
  };

  const handleSaveEdit = () => {
    if (!editingField || !onFieldEdit) return;
    
    const item = progressItems.find(i => i.key === editingField);
    if (item && 'isArray' in item && item.isArray) {
      // Split by newlines and filter empty strings
      const arrayValue = editValue.split("\n").map(s => s.trim()).filter(Boolean);
      onFieldEdit(editingField, arrayValue);
    } else {
      onFieldEdit(editingField, editValue.trim());
    }
    
    setEditingField(null);
    setEditValue("");
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("请上传图片文件");
      return;
    }

    if (onImageUpload) {
      // Use provided upload handler
      await onImageUpload(file);
    } else if (projectId && onFieldEdit) {
      // Handle upload internally
      setLocalIsUploading(true);
      try {
        const fileName = `${projectId}/${crypto.randomUUID()}-${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("reference-images")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("reference-images")
          .getPublicUrl(uploadData.path);

        const newImage: ReferenceImage = {
          id: crypto.randomUUID(),
          url: publicUrl,
          uploadedAt: new Date().toISOString(),
        };

        const currentReferenceImages = prdData?.referenceImages || [];
        const updatedReferenceImages = [...currentReferenceImages, newImage];
        onFieldEdit("referenceImages", updatedReferenceImages);
        
        toast.success("参考图片上传成功");
      } catch (error) {
        console.error(error);
        toast.error("图片上传失败");
      } finally {
        setLocalIsUploading(false);
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const currentEditItem = progressItems.find(i => i.key === editingField);

  return (
    <div className={cn("flex flex-col h-full border-r border-border/50 bg-card/20", className)}>
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">
          {/* Phase Indicator - Compact */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">对话阶段</h3>
            <Badge className={cn("text-xs", phase.color)}>
              {phase.label}
            </Badge>
          </div>
          
          {/* Product Name if available */}
          {prdData?.productName && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="w-3 h-3 text-primary" />
                <span className="text-xs text-muted-foreground">产品名称</span>
              </div>
              <p className="text-sm font-medium text-foreground">{prdData.productName}</p>
              {prdData.productTagline && (
                <p className="text-xs text-muted-foreground mt-0.5">{prdData.productTagline}</p>
              )}
            </div>
          )}

          {/* Progress Header - Simplified */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">产品定义</h3>
              <Badge variant="outline" className="text-xs bg-background/50 gap-1">
                <Asterisk className="w-2.5 h-2.5 text-destructive" />
                {completedCount}/{progressItems.length}
              </Badge>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              {isAllCompleted ? "✓ 已完成" : `继续对话或点击编辑`}
            </p>
          </div>

          {/* Progress Items - Compact */}
          <div className="space-y-2">
            {progressItems.map((item, index) => {
              const Icon = item.icon;
              const isCompleted = isItemCompleted(prdData, item.key);
              const value = getDisplayValue(prdData, item.key);

              return (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card
                    className={cn(
                      "p-2.5 transition-all duration-200 group relative",
                      isCompleted
                        ? "bg-primary/10 border-primary/30"
                        : "bg-muted/20 border-border/40 hover:bg-muted/40",
                      isEditable && "cursor-pointer"
                    )}
                    onClick={() => handleEditClick(item.key)}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0",
                          isCompleted ? "bg-primary/20" : "bg-muted"
                        )}
                      >
                        {isCompleted ? (
                          <Check className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              isCompleted ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            {item.label}
                          </span>
                          <Asterisk className="w-2.5 h-2.5 text-destructive" />
                        </div>
                        {isCompleted && value && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                            {value}
                          </p>
                        )}
                      </div>
                      {isEditable && (
                        <Pencil className="w-3 h-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Competitor Images Reference - Compact */}
          {competitorImages.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <h4 className="text-xs font-medium text-muted-foreground">竞品参考</h4>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {competitorImages.map((imageUrl, index) => (
                    <div
                      key={index}
                      className="aspect-square rounded-md overflow-hidden border border-border/40"
                    >
                      <img
                        src={imageUrl}
                        alt={`竞品 ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* User Reference Images with Upload */}
          <Separator className="my-4" />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5 text-primary" />
              <h4 className="text-xs font-medium text-muted-foreground">我的参考图片</h4>
              {referenceImages.length > 0 && (
                <Badge variant="secondary" className="text-xs">{referenceImages.length}</Badge>
              )}
            </div>
            
            {referenceImages.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {referenceImages.map((img) => (
                  <div
                    key={img.id}
                    className="relative group aspect-square rounded-md overflow-hidden border border-primary/30"
                  >
                    <img
                      src={img.url}
                      alt="参考图片"
                      className="w-full h-full object-cover"
                    />
                    {onImageRemove && (
                      <button
                        onClick={() => onImageRemove(img.id)}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-destructive rounded-full p-1 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* Upload Button */}
            {isEditable && (
              <label className="cursor-pointer block">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={localIsUploading || isUploadingImage}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  asChild
                  disabled={localIsUploading || isUploadingImage}
                >
                  <span>
                    {(localIsUploading || isUploadingImage) ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ImagePlus className="w-4 h-4 mr-2" />
                    )}
                    {(localIsUploading || isUploadingImage) ? "上传中..." : "上传参考图片"}
                  </span>
                </Button>
              </label>
            )}
            
            <p className="text-xs text-muted-foreground">
              {referenceImages.length > 0 
                ? "这些图片将作为产品设计的参考"
                : "上传参考图片指导产品设计"}
            </p>
          </div>

          {/* Completion Status & Action - Compact */}
          {isAllCompleted && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="p-3 rounded-lg bg-gradient-to-r from-primary/15 to-accent/15 border border-primary/30">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">已完成</span>
                </div>
                
                {/* View Document Button */}
                {onOpenPrdDocument && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mb-2"
                    onClick={onOpenPrdDocument}
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    查看完整文档
                  </Button>
                )}
                
                {onProceedToDesign && (
                  <Button
                    size="sm"
                    className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
                    onClick={onProceedToDesign}
                  >
                    进入产品设计
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Edit Dialog */}
      <Dialog open={!!editingField} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {currentEditItem && (
                <>
                  <currentEditItem.icon className="w-5 h-5 text-primary" />
                  编辑{currentEditItem.label}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-value">
                {currentEditItem?.label}
                <span className="text-destructive ml-1">*</span>
              </Label>
              {currentEditItem && 'isArray' in currentEditItem && currentEditItem.isArray ? (
                <Textarea
                  id="edit-value"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder={currentEditItem?.placeholder}
                  rows={5}
                  className="resize-none"
                />
              ) : (
                <Input
                  id="edit-value"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder={currentEditItem?.placeholder}
                />
              )}
              <p className="text-xs text-muted-foreground">
                {currentEditItem && 'isArray' in currentEditItem && currentEditItem.isArray
                  ? "每行输入一项内容"
                  : "请输入内容"}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancelEdit}>
              <X className="w-4 h-4 mr-2" />
              取消
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editValue.trim()}>
              <Check className="w-4 h-4 mr-2" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
