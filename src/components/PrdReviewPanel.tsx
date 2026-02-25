import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  Check, 
  Edit2, 
  RefreshCw, 
  Plus, 
  X, 
  MapPin, 
  Users, 
  Palette, 
  Zap, 
  Image as ImageIcon,
  Video,
  Loader2,
  Save,
  ChevronRight,
  DollarSign,
  Package,
  Tag,
  Settings,
  Target,
  Lightbulb
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
  dialoguePhase?: string | null;
  selectedDirection?: string | null;
  
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
  competitorImages?: {
    productId: string;
    productTitle: string;
    images: string[];
  }[];
}

interface CompetitorProduct {
  id: string;
  product_title?: string;
  product_images?: string[];
  price?: string;
  rating?: number;
}

interface PrdReviewPanelProps {
  prdData: PrdData | null;
  competitorProducts?: CompetitorProduct[];
  projectId: string;
  onSave: (data: PrdData) => Promise<void>;
  onConfirm: () => void;
  onBack: () => void;
}

type PrdSection = 
  | "productOverview"
  | "usageScenario" 
  | "targetAudience" 
  | "designStyle" 
  | "coreFeatures"
  | "specifications"
  | "marketPositioning"
  | "packaging"
  | "marketingAssets" 
  | "videoAssets";

const sectionConfig: Record<PrdSection, { label: string; icon: React.ElementType; description: string }> = {
  productOverview: {
    label: "产品概述",
    icon: Tag,
    description: "产品名称、标语和类别",
  },
  usageScenario: { 
    label: "使用场景", 
    icon: MapPin, 
    description: "产品的主要使用环境和场景" 
  },
  targetAudience: { 
    label: "目标用户", 
    icon: Users, 
    description: "产品的目标用户群体画像" 
  },
  designStyle: { 
    label: "CMF 设计规格", 
    icon: Palette, 
    description: "颜色、材质、表面处理和设计风格" 
  },
  coreFeatures: { 
    label: "功能规格矩阵", 
    icon: Zap, 
    description: "产品的差异化功能和优先级" 
  },
  specifications: {
    label: "产品规格",
    icon: Settings,
    description: "尺寸、重量、材质等技术规格",
  },
  marketPositioning: {
    label: "市场定位与竞争策略",
    icon: Target,
    description: "定价、竞争优势和USP",
  },
  packaging: {
    label: "包装设计",
    icon: Package,
    description: "包装类型、配件和环保特征",
  },
  marketingAssets: { 
    label: "营销素材方案", 
    icon: ImageIcon, 
    description: "AI 自动生成的营销图片素材描述" 
  },
  videoAssets: { 
    label: "视频创意", 
    icon: Video, 
    description: "AI 自动生成的视频脚本和故事线" 
  },
};

export function PrdReviewPanel({
  prdData,
  competitorProducts = [],
  projectId,
  onSave,
  onConfirm,
  onBack,
}: PrdReviewPanelProps) {
  const [editingSection, setEditingSection] = useState<PrdSection | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [editingListValue, setEditingListValue] = useState<string[]>([]);
  const [isRegenerating, setIsRegenerating] = useState<PrdSection | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localPrdData, setLocalPrdData] = useState<PrdData>(prdData || {});

  const startEditing = (section: PrdSection) => {
    setEditingSection(section);
    
    if (section === "coreFeatures") {
      setEditingListValue(localPrdData.coreFeatures || []);
    } else if (section === "productOverview") {
      setEditingValue(JSON.stringify({
        productName: localPrdData.productName || "",
        productTagline: localPrdData.productTagline || "",
        productCategory: localPrdData.productCategory || "",
        pricingRange: localPrdData.pricingRange || "",
      }, null, 2));
    } else if (["marketingAssets", "videoAssets", "specifications", "marketPositioning", "packaging", "designStyle"].includes(section)) {
      const value = section === "marketingAssets" 
        ? localPrdData.marketingAssets 
        : section === "videoAssets"
        ? localPrdData.videoAssets
        : section === "specifications"
        ? localPrdData.specifications
        : section === "marketPositioning"
        ? localPrdData.marketPositioning
        : section === "packaging"
        ? localPrdData.packaging
        : { designStyle: localPrdData.designStyle, cmfDesign: localPrdData.cmfDesign };
      setEditingValue(JSON.stringify(value || {}, null, 2));
    } else {
      setEditingValue(String(localPrdData[section as keyof PrdData] || ""));
    }
  };

  const cancelEditing = () => {
    setEditingSection(null);
    setEditingValue("");
    setEditingListValue([]);
  };

  const saveEditing = async () => {
    if (!editingSection) return;
    
    setIsSaving(true);
    try {
      const updatedData = { ...localPrdData };
      
      if (editingSection === "coreFeatures") {
        updatedData.coreFeatures = editingListValue.filter(v => v.trim());
      } else if (editingSection === "productOverview") {
        try {
          const parsed = JSON.parse(editingValue);
          updatedData.productName = parsed.productName;
          updatedData.productTagline = parsed.productTagline;
          updatedData.productCategory = parsed.productCategory;
          updatedData.pricingRange = parsed.pricingRange;
        } catch {
          toast.error("JSON 格式错误");
          setIsSaving(false);
          return;
        }
      } else if (["marketingAssets", "videoAssets", "specifications", "marketPositioning", "packaging"].includes(editingSection)) {
        try {
          const parsed = JSON.parse(editingValue);
          if (editingSection === "marketingAssets") {
            updatedData.marketingAssets = parsed;
          } else if (editingSection === "videoAssets") {
            updatedData.videoAssets = parsed;
          } else if (editingSection === "specifications") {
            updatedData.specifications = parsed;
          } else if (editingSection === "marketPositioning") {
            updatedData.marketPositioning = parsed;
          } else if (editingSection === "packaging") {
            updatedData.packaging = parsed;
          }
        } catch {
          toast.error("JSON 格式错误");
          setIsSaving(false);
          return;
        }
      } else if (editingSection === "designStyle") {
        try {
          const parsed = JSON.parse(editingValue);
          updatedData.designStyle = parsed.designStyle;
          updatedData.cmfDesign = parsed.cmfDesign;
        } catch {
          toast.error("JSON 格式错误");
          setIsSaving(false);
          return;
        }
      } else {
        (updatedData as Record<string, unknown>)[editingSection] = editingValue;
      }
      
      setLocalPrdData(updatedData);
      await onSave(updatedData);
      cancelEditing();
      toast.success("保存成功");
    } catch (error) {
      toast.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const regenerateSection = async (section: PrdSection) => {
    setIsRegenerating(section);
    
    try {
      const { data, error } = await supabase.functions.invoke("regenerate-prd-section", {
        body: {
          projectId,
          section,
          currentPrdData: localPrdData,
        },
      });

      if (error) throw error;

      if (data?.regeneratedContent) {
        const updatedData = { ...localPrdData };
        
        if (section === "coreFeatures") {
          updatedData.coreFeatures = data.regeneratedContent;
        } else if (section === "marketingAssets") {
          updatedData.marketingAssets = data.regeneratedContent;
        } else if (section === "videoAssets") {
          updatedData.videoAssets = data.regeneratedContent;
        } else if (section === "productOverview") {
          updatedData.productName = data.regeneratedContent.productName;
          updatedData.productTagline = data.regeneratedContent.productTagline;
          updatedData.productCategory = data.regeneratedContent.productCategory;
          updatedData.pricingRange = data.regeneratedContent.pricingRange;
        } else if (section === "specifications") {
          updatedData.specifications = data.regeneratedContent;
        } else if (section === "marketPositioning") {
          updatedData.marketPositioning = data.regeneratedContent;
        } else if (section === "packaging") {
          updatedData.packaging = data.regeneratedContent;
        } else if (section === "designStyle") {
          updatedData.designStyle = data.regeneratedContent.designStyle;
          updatedData.cmfDesign = data.regeneratedContent.cmfDesign;
        } else {
          (updatedData as Record<string, unknown>)[section] = data.regeneratedContent;
        }
        
        setLocalPrdData(updatedData);
        await onSave(updatedData);
        toast.success(`${sectionConfig[section].label} 已重新生成`);
      }
    } catch (error) {
      console.error("Regenerate error:", error);
      toast.error("重新生成失败，请重试");
    } finally {
      setIsRegenerating(null);
    }
  };

  const addListItem = () => {
    setEditingListValue([...editingListValue, ""]);
  };

  const updateListItem = (index: number, value: string) => {
    const updated = [...editingListValue];
    updated[index] = value;
    setEditingListValue(updated);
  };

  const removeListItem = (index: number) => {
    setEditingListValue(editingListValue.filter((_, i) => i !== index));
  };

  const renderSectionContent = (section: PrdSection) => {
    if (editingSection === section) {
      return renderEditingContent(section);
    }

    switch (section) {
      case "productOverview":
        return (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-muted-foreground">产品名称：</span>
                <span className="text-foreground font-medium">{localPrdData.productName || "未定义"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">产品类别：</span>
                <span className="text-foreground">{localPrdData.productCategory || "未定义"}</span>
              </div>
            </div>
            {localPrdData.productTagline && (
              <div>
                <span className="text-muted-foreground">产品标语：</span>
                <span className="text-foreground">{localPrdData.productTagline}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">目标价格：</span>
              <span className="text-foreground font-medium">{localPrdData.pricingRange || "未定义"}</span>
            </div>
          </div>
        );

      case "usageScenario":
      case "targetAudience":
        return (
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">
            {localPrdData[section] || <span className="text-muted-foreground italic">未定义</span>}
          </p>
        );

      case "designStyle": {
        const cmf = localPrdData.cmfDesign;
        return (
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">整体调性：</span>
              <span className="text-foreground">{localPrdData.designStyle || "未定义"}</span>
            </div>
            {cmf && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {cmf.primaryColor && (
                    <div className="p-2 rounded-lg bg-muted/50">
                      <span className="text-xs text-muted-foreground">主色</span>
                      <p className="text-foreground">{cmf.primaryColor}</p>
                    </div>
                  )}
                  {cmf.secondaryColor && (
                    <div className="p-2 rounded-lg bg-muted/50">
                      <span className="text-xs text-muted-foreground">辅色</span>
                      <p className="text-foreground">{cmf.secondaryColor}</p>
                    </div>
                  )}
                  {cmf.accentColor && (
                    <div className="p-2 rounded-lg bg-muted/50">
                      <span className="text-xs text-muted-foreground">点缀色</span>
                      <p className="text-foreground">{cmf.accentColor}</p>
                    </div>
                  )}
                </div>
                {cmf.surfaceFinish && (
                  <div>
                    <span className="text-muted-foreground">表面处理：</span>
                    <span className="text-foreground">{cmf.surfaceFinish}</span>
                  </div>
                )}
                {cmf.materialBreakdown && cmf.materialBreakdown.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">材质分布：</span>
                    <div className="mt-1 space-y-1">
                      {cmf.materialBreakdown.map((m, i) => (
                        <div key={i} className="text-xs flex gap-2">
                          <Badge variant="outline">{m.material}</Badge>
                          <span>{m.percentage}%</span>
                          <span className="text-muted-foreground">- {m.location}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      }

      case "coreFeatures": {
        const features = localPrdData.coreFeatures || [];
        const featureMatrix = localPrdData.featureMatrix || [];
        
        if (featureMatrix.length > 0) {
          return (
            <div className="space-y-2">
              {featureMatrix.map((f, i) => (
                <div key={i} className="p-2 rounded-lg bg-muted/30 border border-border/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        f.priority === "must-have" && "border-destructive/50 text-destructive",
                        f.priority === "important" && "border-primary/50 text-primary",
                        f.priority === "nice-to-have" && "border-muted-foreground/50 text-muted-foreground",
                      )}
                    >
                      {f.priority === "must-have" ? "必须" : f.priority === "important" ? "重要" : "加分"}
                    </Badge>
                    <span className="font-medium">{f.feature}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    解决痛点: {f.painPointAddressed} | 差异化: {f.differentiator}
                  </p>
                </div>
              ))}
            </div>
          );
        }
        
        return features.length > 0 ? (
          <ul className="space-y-2">
            {features.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground italic">未定义</p>
        );
      }

      case "specifications": {
        const specs = localPrdData.specifications;
        return specs ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {specs.dimensions && (
              <div>
                <span className="text-muted-foreground">尺寸：</span>
                <span className="text-foreground">{specs.dimensions}</span>
              </div>
            )}
            {specs.weight && (
              <div>
                <span className="text-muted-foreground">重量：</span>
                <span className="text-foreground">{specs.weight}</span>
              </div>
            )}
            {specs.materials && specs.materials.length > 0 && (
              <div className="col-span-2">
                <span className="text-muted-foreground">材质：</span>
                <span className="text-foreground">{specs.materials.join("、")}</span>
              </div>
            )}
            {specs.colors && specs.colors.length > 0 && (
              <div className="col-span-2">
                <span className="text-muted-foreground">颜色：</span>
                <span className="text-foreground">{specs.colors.join("、")}</span>
              </div>
            )}
            {specs.powerSource && (
              <div>
                <span className="text-muted-foreground">供电方式：</span>
                <span className="text-foreground">{specs.powerSource}</span>
              </div>
            )}
            {specs.connectivity && (
              <div>
                <span className="text-muted-foreground">连接方式：</span>
                <span className="text-foreground">{specs.connectivity}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">AI 将自动生成</p>
        );
      }

      case "marketPositioning": {
        const mp = localPrdData.marketPositioning;
        return mp ? (
          <div className="space-y-3 text-sm">
            {mp.priceTier && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">定价层级：</span>
                <Badge variant="outline">{mp.priceTier}</Badge>
              </div>
            )}
            {mp.uniqueSellingPoints && mp.uniqueSellingPoints.length > 0 && (
              <div>
                <span className="text-muted-foreground">核心卖点 (USP)：</span>
                <ul className="mt-1 space-y-1">
                  {mp.uniqueSellingPoints.map((usp, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Lightbulb className="w-3 h-3 text-primary" />
                      <span>{usp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {mp.competitiveAdvantages && mp.competitiveAdvantages.length > 0 && (
              <div>
                <span className="text-muted-foreground">竞争优势：</span>
                <span className="text-foreground">{mp.competitiveAdvantages.join("、")}</span>
              </div>
            )}
            {mp.primaryCompetitors && mp.primaryCompetitors.length > 0 && (
              <div>
                <span className="text-muted-foreground">主要竞品：</span>
                <span className="text-foreground">{mp.primaryCompetitors.join("、")}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">AI 将自动生成</p>
        );
      }

      case "packaging": {
        const pkg = localPrdData.packaging;
        return pkg ? (
          <div className="space-y-2 text-sm">
            {pkg.packageType && (
              <div>
                <span className="text-muted-foreground">包装类型：</span>
                <span className="text-foreground">{pkg.packageType}</span>
              </div>
            )}
            {pkg.includedAccessories && pkg.includedAccessories.length > 0 && (
              <div>
                <span className="text-muted-foreground">包装内容：</span>
                <span className="text-foreground">{pkg.includedAccessories.join("、")}</span>
              </div>
            )}
            {pkg.specialPackagingFeatures && (
              <div>
                <span className="text-muted-foreground">特色设计：</span>
                <span className="text-foreground">{pkg.specialPackagingFeatures}</span>
              </div>
            )}
            {pkg.sustainabilityFeatures && (
              <div>
                <span className="text-muted-foreground">环保特征：</span>
                <span className="text-foreground">{pkg.sustainabilityFeatures}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">AI 将自动生成</p>
        );
      }

      case "marketingAssets": {
        const marketing = localPrdData.marketingAssets;
        return marketing ? (
          <div className="space-y-3 text-sm">
            {marketing.sceneDescription && (
              <div>
                <span className="text-muted-foreground">主图场景：</span>
                <span className="text-foreground">{marketing.sceneDescription}</span>
              </div>
            )}
            {marketing.lifestyleContext && (
              <div>
                <span className="text-muted-foreground">生活方式：</span>
                <span className="text-foreground">{marketing.lifestyleContext}</span>
              </div>
            )}
            {marketing.usageScenarios && marketing.usageScenarios.length > 0 && (
              <div>
                <span className="text-muted-foreground">使用场景：</span>
                <span className="text-foreground">{marketing.usageScenarios.join("、")}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">AI 将自动生成</p>
        );
      }

      case "videoAssets": {
        const video = localPrdData.videoAssets;
        return video ? (
          <div className="space-y-3 text-sm">
            {video.storyLine && (
              <div>
                <span className="text-muted-foreground">故事线：</span>
                <span className="text-foreground">{video.storyLine}</span>
              </div>
            )}
            {video.keyActions && video.keyActions.length > 0 && (
              <div>
                <span className="text-muted-foreground">关键动作：</span>
                <span className="text-foreground">{video.keyActions.join("、")}</span>
              </div>
            )}
            {video.emotionalTone && (
              <div>
                <span className="text-muted-foreground">情感基调：</span>
                <span className="text-foreground">{video.emotionalTone}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">AI 将自动生成</p>
        );
      }

      default:
        return null;
    }
  };

  const renderEditingContent = (section: PrdSection) => {
    if (section === "coreFeatures") {
      return (
        <div className="space-y-2">
          {editingListValue.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={(e) => updateListItem(index, e.target.value)}
                placeholder={`功能 ${index + 1}`}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeListItem(index)}
                className="h-8 w-8 text-destructive"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={addListItem}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            添加功能
          </Button>
        </div>
      );
    }

    if (["marketingAssets", "videoAssets", "specifications", "marketPositioning", "packaging", "designStyle", "productOverview"].includes(section)) {
      return (
        <Textarea
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          placeholder="JSON 格式编辑..."
          className="min-h-[200px] font-mono text-sm"
        />
      );
    }

    return (
      <Textarea
        value={editingValue}
        onChange={(e) => setEditingValue(e.target.value)}
        placeholder="输入内容..."
        className="min-h-[100px]"
      />
    );
  };

  const sections: PrdSection[] = [
    "productOverview",
    "usageScenario",
    "targetAudience",
    "designStyle",
    "coreFeatures",
    "specifications",
    "marketPositioning",
    "packaging",
    "marketingAssets",
    "videoAssets",
  ];

  // Get competitor images from products
  const competitorImagesData = competitorProducts
    .filter(p => p.product_images && p.product_images.length > 0)
    .map(p => ({
      productId: p.id,
      productTitle: p.product_title || "未知产品",
      images: p.product_images || [],
    }));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">📋 PRD 文档审核</h2>
            <p className="text-sm text-muted-foreground">审核并编辑产品需求定义的每个细节</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onBack}>
            返回对话
          </Button>
          <Button 
            className="bg-gradient-primary glow-primary"
            onClick={onConfirm}
          >
            确认 PRD 并进入视觉生成
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* PRD Sections */}
          {sections.map((section) => {
            const config = sectionConfig[section];
            const Icon = config.icon;
            const isEditing = editingSection === section;
            const isRegenLoading = isRegenerating === section;

            return (
              <motion.div
                key={section}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="p-4 bg-card/50 border-border/50">
                  {/* Section Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{config.label}</h3>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                    
                    {!isEditing && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(section)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => regenerateSection(section)}
                          disabled={isRegenLoading}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isRegenLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="w-4 h-4 mr-1" />
                          )}
                          AI 重新生成
                        </Button>
                      </div>
                    )}
                  </div>

                  <Separator className="mb-3" />

                  {/* Section Content */}
                  <div className="min-h-[60px]">
                    {renderSectionContent(section)}
                  </div>

                  {/* Editing Actions */}
                  {isEditing && (
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/30">
                      <Button
                        size="sm"
                        onClick={saveEditing}
                        disabled={isSaving}
                        className="bg-gradient-primary"
                      >
                        {isSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <Save className="w-4 h-4 mr-1" />
                        )}
                        保存
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelEditing}
                      >
                        取消
                      </Button>
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })}

          {/* Competitor Reference Images */}
          {competitorImagesData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="p-4 bg-card/50 border-border/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-accent-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">📸 竞品参考图片</h3>
                    <p className="text-xs text-muted-foreground">
                      已分析 {competitorImagesData.length} 款竞品的产品图片
                    </p>
                  </div>
                </div>

                <Separator className="mb-3" />

                <div className="space-y-4">
                  {competitorImagesData.map((product) => (
                    <div key={product.productId}>
                      <p className="text-sm font-medium text-foreground mb-2 truncate">
                        {product.productTitle}
                      </p>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {product.images.slice(0, 6).map((imgUrl, index) => (
                          <div 
                            key={index}
                            className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted border border-border/30"
                          >
                            <img 
                              src={imgUrl} 
                              alt={`竞品图 ${index + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {/* Bottom Actions */}
          <div className="flex items-center justify-center gap-4 pt-4 pb-8">
            <Button variant="outline" size="lg" onClick={onBack}>
              返回对话继续调整
            </Button>
            <Button 
              size="lg"
              className="bg-gradient-primary glow-primary"
              onClick={onConfirm}
            >
              确认 PRD 并进入视觉生成
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
