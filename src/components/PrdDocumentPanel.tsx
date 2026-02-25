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
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PrdData } from "@/components/PrdExtractionSidebar";

interface CompetitorProduct {
  id: string;
  product_title?: string;
  product_images?: string[];
  price?: string;
  rating?: number;
}

interface PrdDocumentPanelProps {
  prdData: PrdData | null;
  competitorProducts?: CompetitorProduct[];
  projectId: string;
  onSave: (data: PrdData) => Promise<void>;
  onConfirm: () => void;
  onBack: () => void;
}

type PrdSection =
  | "usageScenario"
  | "targetAudience"
  | "designStyle"
  | "coreFeatures"
  | "marketingAssets"
  | "videoAssets";

const sectionConfig: Record<
  PrdSection,
  { label: string; icon: React.ElementType; description: string }
> = {
  usageScenario: {
    label: "使用场景",
    icon: MapPin,
    description: "产品的主要使用环境和场景",
  },
  targetAudience: {
    label: "目标用户",
    icon: Users,
    description: "产品的目标用户群体画像",
  },
  designStyle: {
    label: "外观风格",
    icon: Palette,
    description: "产品的材质、配色和设计风格",
  },
  coreFeatures: {
    label: "核心功能",
    icon: Zap,
    description: "产品的差异化功能和卖点",
  },
  marketingAssets: {
    label: "营销素材方案",
    icon: ImageIcon,
    description: "AI 自动生成的营销图片素材描述",
  },
  videoAssets: {
    label: "视频创意",
    icon: Video,
    description: "AI 自动生成的视频脚本和故事线",
  },
};

export function PrdDocumentPanel({
  prdData,
  competitorProducts = [],
  projectId,
  onSave,
  onConfirm,
  onBack,
}: PrdDocumentPanelProps) {
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
    } else if (section === "marketingAssets" || section === "videoAssets") {
      const value =
        section === "marketingAssets"
          ? localPrdData.marketingAssets
          : localPrdData.videoAssets;
      setEditingValue(JSON.stringify(value || {}, null, 2));
    } else {
      setEditingValue(String(localPrdData[section] || ""));
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
        updatedData.coreFeatures = editingListValue.filter((v) => v.trim());
      } else if (
        editingSection === "marketingAssets" ||
        editingSection === "videoAssets"
      ) {
        try {
          const parsed = JSON.parse(editingValue);
          if (editingSection === "marketingAssets") {
            updatedData.marketingAssets = parsed;
          } else {
            updatedData.videoAssets = parsed;
          }
        } catch {
          toast.error("JSON 格式错误");
          setIsSaving(false);
          return;
        }
      } else {
        (updatedData as any)[editingSection] = editingValue;
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
      const { data, error } = await supabase.functions.invoke(
        "regenerate-prd-section",
        {
          body: {
            projectId,
            section,
            currentPrdData: localPrdData,
          },
        }
      );

      if (error) throw error;

      if (data?.regeneratedContent) {
        const updatedData = { ...localPrdData };

        if (section === "coreFeatures") {
          updatedData.coreFeatures = data.regeneratedContent;
        } else if (section === "marketingAssets") {
          updatedData.marketingAssets = data.regeneratedContent;
        } else if (section === "videoAssets") {
          updatedData.videoAssets = data.regeneratedContent;
        } else {
          (updatedData as any)[section] = data.regeneratedContent;
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
      case "usageScenario":
      case "targetAudience":
      case "designStyle":
        return (
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">
            {localPrdData[section] || (
              <span className="text-muted-foreground italic">未定义</span>
            )}
          </p>
        );

      case "coreFeatures": {
        const features = localPrdData.coreFeatures || [];
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

      case "marketingAssets": {
        const marketing = localPrdData.marketingAssets;
        return marketing ? (
          <div className="space-y-3 text-sm">
            {marketing.sceneDescription && (
              <div>
                <span className="text-muted-foreground">场景图：</span>
                <span className="text-foreground">
                  {marketing.sceneDescription}
                </span>
              </div>
            )}
            {marketing.lifestyleContext && (
              <div>
                <span className="text-muted-foreground">生活方式：</span>
                <span className="text-foreground">
                  {marketing.lifestyleContext}
                </span>
              </div>
            )}
            {marketing.usageScenarios && marketing.usageScenarios.length > 0 && (
              <div>
                <span className="text-muted-foreground">使用场景：</span>
                <span className="text-foreground">
                  {marketing.usageScenarios.join("、")}
                </span>
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
                <span className="text-foreground">
                  {video.keyActions.join("、")}
                </span>
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

    if (section === "marketingAssets" || section === "videoAssets") {
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
    "usageScenario",
    "targetAudience",
    "designStyle",
    "coreFeatures",
    "marketingAssets",
    "videoAssets",
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">📋 产品 PRD 文档</h2>
            <p className="text-sm text-muted-foreground">
              审核并编辑产品需求定义
            </p>
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
                        <h3 className="font-semibold text-foreground">
                          {config.label}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {config.description}
                        </p>
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
                  <AnimatePresence>
                    {isEditing && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border/50"
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEditing}
                        >
                          取消
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveEditing}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          ) : (
                            <Check className="w-4 h-4 mr-1" />
                          )}
                          保存
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}

          {/* Competitor Reference Images */}
          {competitorProducts.length > 0 && (
            <Card className="p-4 bg-card/50 border-border/50">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">竞品图片参考</h3>
                  <p className="text-xs text-muted-foreground">
                    来自竞品研究的产品图片
                  </p>
                </div>
              </div>
              <Separator className="mb-4" />
              <div className="grid grid-cols-4 gap-3">
                {competitorProducts
                  .flatMap((p) => p.product_images || [])
                  .slice(0, 8)
                  .map((imageUrl, index) => (
                    <div
                      key={index}
                      className="aspect-square rounded-lg overflow-hidden border border-border/50"
                    >
                      <img
                        src={imageUrl}
                        alt={`竞品图片 ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
