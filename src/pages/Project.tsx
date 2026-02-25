import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StageIndicator } from "@/components/StageIndicator";
import { StageTransitionPrompt } from "@/components/StageTransitionPrompt";
import { ChatMessage } from "@/components/ChatMessage";
import { VisualGenerationPhase } from "@/components/VisualGenerationPhase";
import { LandingPageBuilder } from "@/components/LandingPageBuilder";
import { LandingPageAnalytics } from "@/components/LandingPageAnalytics";
import { MarketResearchPhase } from "@/components/MarketResearchPhase";
import { PrdPhase } from "@/components/PrdPhase";
import { PrdData } from "@/components/PrdExtractionSidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles, MessageSquare, Image, Globe, TrendingUp, BarChart3 } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  stage: number;
  suggestions?: string[];
}

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

interface GeneratedVideo {
  id: string;
  video_url: string | null;
  prompt: string;
  scene_description: string | null;
  duration_seconds: number;
  status: string;
}

interface LandingPageData {
  id: string;
  title: string;
  slug: string;
  hero_image_url: string | null;
  pain_points: string[] | null;
  selling_points: string[] | null;
  trust_badges: string[] | null;
  is_published: boolean;
  view_count: number;
  version?: number;
  is_active?: boolean;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  current_stage: number;
  status: string;
  prd_data: unknown;
  visual_data: unknown;
  landing_page_data: unknown;
  competitor_research_completed?: boolean;
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [productImages, setProductImages] = useState<GeneratedImage[]>([]);
  const [marketingImages, setMarketingImages] = useState<GeneratedImage[]>([]);
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const [landingPage, setLandingPage] = useState<LandingPageData | null>(null);
  const [activeTab, setActiveTab] = useState("research");
  const [showTransitionPrompt, setShowTransitionPrompt] = useState(false);
  const [prdData, setPrdData] = useState<PrdData | null>(null);
  const [competitorProducts, setCompetitorProducts] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      fetchProject();
      fetchMessages();
      fetchImages();
      fetchVideos();
      fetchLandingPage();
      fetchCompetitorProductsData();
    }
  }, [id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    // Auto-switch tabs based on stage
    if (project) {
      if (project.current_stage === 1) {
        setActiveTab("research");
      } else if (project.current_stage === 2) {
        setActiveTab("prd");
      } else if (project.current_stage === 3) {
        setActiveTab("images");
      } else if (project.current_stage === 4) {
        setActiveTab("landing");
      } else if (project.current_stage === 5) {
        setActiveTab("analytics");
      }
    }
  }, [project?.current_stage]);

  const fetchProject = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      toast.error("获取项目失败");
      navigate("/dashboard");
    } else {
      const projectData: Project = {
        id: data.id,
        name: data.name,
        description: data.description,
        current_stage: data.current_stage,
        status: data.status,
        prd_data: data.prd_data,
        visual_data: data.visual_data,
        landing_page_data: data.landing_page_data,
        competitor_research_completed: data.competitor_research_completed,
      };
      
      // Parse PRD data
      if (data.prd_data && typeof data.prd_data === 'object') {
        setPrdData(data.prd_data as PrdData);
      }
      
      setProject(projectData);
    }
    setIsLoading(false);
  };

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(
        data.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          stage: m.stage,
        }))
      );
    }
  };

  const fetchImages = async () => {
    const { data, error } = await supabase
      .from("generated_images")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: true });

    if (!error && data) {
      const phase1Images = data.filter((img: any) => (img.phase || 1) === 1);
      const phase2Images = data.filter((img: any) => img.phase === 2);
      setProductImages(phase1Images as GeneratedImage[]);
      setMarketingImages(phase2Images as GeneratedImage[]);
    }
  };

  const fetchVideos = async () => {
    const { data, error } = await supabase
      .from("generated_videos")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setVideos(data as GeneratedVideo[]);
    }
  };

  const fetchLandingPage = async () => {
    // Get the active version of landing page
    const { data, error } = await supabase
      .from("landing_pages")
      .select("*")
      .eq("project_id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (!error && data) {
      setLandingPage(data as unknown as LandingPageData);
    } else {
      // Fallback: try to get any landing page if no active one
      const { data: anyPage } = await supabase
        .from("landing_pages")
        .select("*")
        .eq("project_id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (anyPage) {
        setLandingPage(anyPage as unknown as LandingPageData);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSending) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsSending(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      stage: project?.current_stage || 1,
    };
    setMessages((prev) => [...prev, userMsg]);

    await supabase.from("chat_messages").insert({
      project_id: id,
      role: "user",
      content: userMessage,
      stage: project?.current_stage || 1,
    });

    const chatHistory = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setIsStreaming(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("No active session");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messages: chatHistory,
            projectId: id,
            currentStage: project?.current_stage || 1,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("AI请求失败");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let assistantMsgId = crypto.randomUUID();

      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", stage: project?.current_stage || 1 },
      ]);

      if (reader) {
        let textBuffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);

            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: assistantContent } : m
                  )
                );
              }
            } catch {
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }
      }

      if (assistantContent) {
        await supabase.from("chat_messages").insert({
          project_id: id,
          role: "assistant",
          content: assistantContent,
          stage: project?.current_stage || 1,
        });

        const stageCompleteSignal = detectStageCompletion(assistantContent, project?.current_stage || 1);
        if (stageCompleteSignal) {
          setTimeout(() => {
            setShowTransitionPrompt(true);
          }, 1000);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("AI回复失败，请重试");
    } finally {
      setIsSending(false);
      setIsStreaming(false);
    }
  };

  const advanceStage = async (targetStage?: number) => {
    if (!project) {
      const errorMsg = "项目数据未加载，无法切换阶段";
      console.error("[Stage Switch Error]", errorMsg, { projectId: id });
      toast.error(errorMsg);
      return;
    }
    
    const newStage = targetStage || project.current_stage + 1;
    if (newStage > 5) {
      const errorMsg = "已是最后阶段，无法继续前进";
      console.warn("[Stage Switch]", errorMsg, { currentStage: project.current_stage, targetStage: newStage });
      return;
    }
    
    console.log("[Stage Switch] Attempting to advance", { 
      from: project.current_stage, 
      to: newStage, 
      projectId: id 
    });
    
    const { error } = await supabase
      .from("projects")
      .update({ current_stage: newStage })
      .eq("id", id);

    if (error) {
      const errorDetails = `阶段更新失败: ${error.message || "未知错误"}`;
      console.error("[Stage Switch Error]", errorDetails, { 
        code: error.code, 
        details: error.details, 
        hint: error.hint,
        projectId: id,
        targetStage: newStage
      });
      toast.error(errorDetails, {
        description: error.hint || `错误代码: ${error.code || "UNKNOWN"}`,
        duration: 5000,
      });
    } else {
      console.log("[Stage Switch Success]", { from: project.current_stage, to: newStage });
      setProject((prev) => prev ? { ...prev, current_stage: newStage } : null);
      setShowTransitionPrompt(false);
      toast.success(`🎉 进入阶段 ${newStage}`);
    }
  };

  const handleStageTransitionConfirm = () => {
    advanceStage();
  };

  const detectStageCompletion = (content: string, currentStage: number): boolean => {
    if (currentStage === 2) {
      if (content.includes("[STAGE_COMPLETE:2]")) {
        return true;
      }
      
      const completionIndicators = [
        "PRD细化已完成",
        "PRD信息收集已完成",
        "进入视觉生成阶段",
        "开始视觉生成",
        "开始生成产品渲染",
        "我已经充分了解",
        "信息已经足够",
        "可以进入下一阶段",
        "准备进入视觉生成"
      ];
      
      const hasSummary = content.includes("总结") || content.includes("汇总") || content.includes("确认以下信息");
      const hasNextStepHint = completionIndicators.some(indicator => content.includes(indicator));
      
      return hasNextStepHint || (hasSummary && content.includes("视觉"));
    }
    
    return false;
  };

  const handleMarketResearchComplete = async () => {
    await advanceStage(2);
    await fetchProject();
    setActiveTab("prd");
  };

  const handlePrdPhaseComplete = async () => {
    // Refresh project data to get latest prd_data
    await fetchProject();
    // Fetch competitor products for image references
    await fetchCompetitorProductsData();
    setActiveTab("images");
  };

  const fetchCompetitorProductsData = async () => {
    const { data } = await supabase
      .from("competitor_products")
      .select("*")
      .eq("project_id", id)
      .eq("status", "completed");

    if (data) {
      setCompetitorProducts(data.map((p: any) => ({
        id: p.id,
        product_title: p.product_title || undefined,
        product_images: (p.product_images as string[]) || undefined,
        main_image: p.main_image || undefined,
        price: p.price || undefined,
        rating: p.rating ? Number(p.rating) : undefined,
      })));
    }
  };

  const handleVisualPhaseConfirm = () => {
    advanceStage(4);
  };

  const getSelectedImageUrl = () => {
    const selected = productImages.find((img) => img.is_selected);
    return selected?.image_url;
  };

  const getSelectedImageId = () => {
    const selected = productImages.find((img) => img.is_selected);
    return selected?.id;
  };

  const getPrdData = () => {
    const data = project?.prd_data as any;
    return {
      usageScenarios: data?.usageScenarios || data?.marketingAssets?.usageScenarios || [],
      targetAudience: data?.targetAudience || "",
      coreFeatures: data?.coreFeatures || [],
      designStyle: data?.designStyle || "",
      selectedDirection: data?.selectedDirection || "",
    };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">加载项目中...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-dark flex flex-col">
      {/* Stage Transition Prompt */}
      <StageTransitionPrompt
        isVisible={showTransitionPrompt}
        currentStage={project?.current_stage || 1}
        onConfirm={handleStageTransitionConfirm}
        onDismiss={() => setShowTransitionPrompt(false)}
      />

      {/* Header */}
      <header className="border-b border-border/50 glass sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2">
                <motion.div 
                  className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 400 }}
                >
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </motion.div>
                <div>
                  <h1 className="font-semibold">{project?.name}</h1>
                  <p className="text-xs text-muted-foreground">产品研发项目</p>
                </div>
              </div>
            </div>
          </div>
          <StageIndicator 
            currentStage={project?.current_stage || 1}
            isProjectCompleted={landingPage?.is_published}
            onStageClick={(stageId) => {
              if (stageId === 1) setActiveTab("research");
              else if (stageId === 2) setActiveTab("prd");
              else if (stageId === 3) setActiveTab("images");
              else if (stageId === 4) setActiveTab("landing");
              else if (stageId === 5) setActiveTab("analytics");
            }}
          />
        </div>
      </header>

      {/* Content Area with Tabs */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">

          {/* Market Research Tab */}
          <TabsContent value="research" className="flex-1 flex w-full min-h-0 overflow-hidden m-0">
            <MarketResearchPhase
              projectId={id || ""}
              onComplete={handleMarketResearchComplete}
              isReadOnly={(project?.current_stage || 1) > 1 || landingPage?.is_published}
            />
          </TabsContent>

          {/* PRD Tab - Using new PrdPhase component */}
          <TabsContent value="prd" className="flex-1 flex w-full min-h-0 overflow-hidden m-0">
            <PrdPhase
              projectId={id || ""}
              onComplete={handlePrdPhaseComplete}
              isReadOnly={(project?.current_stage || 1) > 2 || landingPage?.is_published}
            />
          </TabsContent>

          {/* Images Tab */}
          <TabsContent value="images" className="flex-1 overflow-auto p-4 m-0">
            <div className="max-w-5xl mx-auto">
              <VisualGenerationPhase
                projectId={id || ""}
                productImages={productImages}
                marketingImages={marketingImages}
                onProductImagesChange={setProductImages}
                onMarketingImagesChange={setMarketingImages}
                onConfirmAndProceed={handleVisualPhaseConfirm}
                prdSummary={project?.name}
                prdData={getPrdData()}
                competitorProducts={competitorProducts}
                hasLandingPage={!!landingPage}
                onLandingPageReset={async () => {
                  if (landingPage) {
                    await supabase.from("landing_pages").delete().eq("project_id", id);
                    setLandingPage(null);
                  }
                }}
              />
            </div>
          </TabsContent>

          {/* Landing Page Tab */}
          <TabsContent value="landing" className="flex-1 overflow-auto p-4 m-0">
            <div className="max-w-5xl mx-auto">
              <LandingPageBuilder
                projectId={id || ""}
                projectName={project?.name || ""}
                selectedImageUrl={getSelectedImageUrl()}
                selectedImageId={getSelectedImageId()}
                prdData={getPrdData()}
                marketingImages={marketingImages.map(img => ({
                  id: img.id,
                  image_url: img.image_url,
                  image_type: img.image_type || "scene",
                  marketing_copy: img.marketing_copy || undefined,
                }))}
                videos={videos}
                videoUrl={videos.find(v => v.video_url)?.video_url || undefined}
                landingPage={landingPage}
                onLandingPageChange={setLandingPage}
                onMarketingImagesChange={(newImages) => {
                  setMarketingImages(newImages.map(img => ({
                    id: img.id,
                    image_url: img.image_url,
                    prompt: "",
                    is_selected: false,
                    feedback: null,
                    image_type: img.image_type,
                    phase: 2,
                    parent_image_id: null,
                    marketing_copy: img.marketing_copy || null,
                  })));
                }}
                onVideosChange={setVideos}
                onBackToVisual={() => setActiveTab("images")}
                onStageAdvance={(stage) => {
                  setProject((prev) => prev ? { ...prev, current_stage: stage } : null);
                  setActiveTab("analytics");
                }}
                isReadOnly={landingPage?.is_published}
              />
            </div>
          </TabsContent>

          {/* Analytics Tab - Stage 5 */}
          <TabsContent value="analytics" className="flex-1 overflow-auto p-4 m-0">
            <div className="max-w-5xl mx-auto">
              {landingPage?.is_published ? (
                <LandingPageAnalytics
                  landingPageId={landingPage.id}
                  landingPageSlug={landingPage.slug}
                  landingPageTitle={landingPage.title}
                  viewCount={landingPage.view_count}
                />
              ) : (
                <Card className="glass border-border/50">
                  <CardContent className="p-8 text-center">
                    <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">暂无数据</h3>
                    <p className="text-muted-foreground mb-4">
                      请先发布落地页以开始收集市场数据
                    </p>
                    <Button 
                      variant="outline" 
                      onClick={() => setActiveTab("landing")}
                    >
                      返回落地页
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
