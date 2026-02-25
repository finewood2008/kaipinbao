import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, ArrowLeft, TrendingUp, Search, Sparkles, Globe, Target, Zap } from "lucide-react";
import { MarketAnalysisPhase } from "@/components/MarketAnalysisPhase";
import { CompetitorResearch } from "@/components/CompetitorResearch";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface MarketResearchPhaseProps {
  projectId: string;
  onComplete: () => void;
  isReadOnly?: boolean;
}

interface CompetitorProduct {
  id: string;
  product_title?: string;
  product_images?: string[];
  main_image?: string;
  price?: string;
  rating?: number;
}

const subPhases = [
  { 
    id: 1 as const, 
    label: "市场分析", 
    icon: TrendingUp,
    description: "AI 分析市场格局与机会",
    gradient: "from-primary to-accent"
  },
  { 
    id: 2 as const, 
    label: "竞品分析", 
    icon: Search,
    description: "抓取竞品信息与用户评论",
    gradient: "from-accent to-primary"
  },
];

export function MarketResearchPhase({
  projectId,
  onComplete,
  isReadOnly = false,
}: MarketResearchPhaseProps) {
  const [currentSubPhase, setCurrentSubPhase] = useState<1 | 2>(1);
  const [phase1Completed, setPhase1Completed] = useState(false);
  const [phase2Completed, setPhase2Completed] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [competitorProducts, setCompetitorProducts] = useState<CompetitorProduct[]>([]);

  const loadProjectData = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("prd_data, competitor_research_completed")
      .eq("id", projectId)
      .single();

    if (data?.prd_data) {
      const prd = data.prd_data as { initialMarketAnalysis?: unknown };
      if (prd.initialMarketAnalysis) {
        setPhase1Completed(true);
      }
    }
    if (data?.competitor_research_completed) {
      setPhase2Completed(true);
    }
  }, [projectId]);

  const loadCompetitorProducts = useCallback(async () => {
    const { data } = await supabase
      .from("competitor_products")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "completed");

    if (data) {
      setCompetitorProducts(
        data.map((p) => ({
          id: p.id,
          product_title: p.product_title || undefined,
          product_images: (p.product_images as string[]) || undefined,
          main_image: p.main_image || undefined,
          price: p.price || undefined,
          rating: p.rating ? Number(p.rating) : undefined,
        }))
      );
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectData();
    loadCompetitorProducts();
  }, [loadProjectData, loadCompetitorProducts]);

  const handleMarketAnalysisComplete = () => {
    setPhase1Completed(true);
    setShowTransition(true);
  };

  const handleMarketAnalysisSkip = () => {
    setPhase1Completed(true);
    setCurrentSubPhase(2);
  };

  const handleCompetitorResearchComplete = async (hasResearch: boolean) => {
    await supabase
      .from("projects")
      .update({ competitor_research_completed: true })
      .eq("id", projectId);

    setPhase2Completed(true);
    await loadCompetitorProducts();
    
    onComplete();
  };

  const handleCompetitorResearchSkip = async () => {
    await supabase
      .from("projects")
      .update({ competitor_research_completed: true })
      .eq("id", projectId);

    setPhase2Completed(true);
    onComplete();
  };

  const handleTransitionConfirm = () => {
    setShowTransition(false);
    setCurrentSubPhase(2);
  };

  const handleSubPhaseClick = (phase: 1 | 2) => {
    if (phase === 1) {
      setCurrentSubPhase(1);
    } else if (phase === 2 && phase1Completed) {
      setCurrentSubPhase(2);
    }
  };

  const isCompleted = (phase: number) => {
    if (phase === 1) return phase1Completed;
    if (phase === 2) return phase2Completed;
    return false;
  };

  const canNavigate = (phase: number) => {
    if (phase === 1) return true;
    if (phase === 2) return phase1Completed;
    return false;
  };

  return (
    <div className="h-full w-full flex flex-col min-h-0 overflow-hidden bg-gradient-to-b from-background via-background to-muted/20">
      {/* Read-only Banner */}
      {isReadOnly && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex items-center justify-center gap-2"
        >
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-primary">
            查看模式 - 市场调研阶段已完成
          </span>
        </motion.div>
      )}

      {/* Enhanced Sub-phase Navigation */}
      <div className="px-4 py-4 border-b border-border/30 bg-card/30 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-2">
            {subPhases.map((phase, index) => {
              const Icon = phase.icon;
              const completed = isCompleted(phase.id);
              const isCurrent = currentSubPhase === phase.id;
              const canClick = canNavigate(phase.id) && !isCurrent;

              return (
                <div key={phase.id} className="flex items-center">
                  <motion.button
                    onClick={() => canClick && handleSubPhaseClick(phase.id)}
                    disabled={!canClick}
                    className={cn(
                      "relative flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300",
                      isCurrent
                        ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/25"
                        : completed
                        ? "bg-primary/15 text-primary hover:bg-primary/25"
                        : "bg-muted/50 text-muted-foreground"
                    )}
                    whileHover={canClick ? { scale: 1.02, y: -1 } : {}}
                    whileTap={canClick ? { scale: 0.98 } : {}}
                  >
                    {/* Step number badge */}
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                      isCurrent 
                        ? "bg-primary-foreground/20" 
                        : completed 
                        ? "bg-primary/20" 
                        : "bg-muted"
                    )}>
                      {completed && !isCurrent ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <span>{phase.id}</span>
                      )}
                    </div>
                    
                    <div className="text-left hidden sm:block">
                      <div className="font-medium text-sm">{phase.label}</div>
                      {isCurrent && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="text-[10px] opacity-80 leading-tight"
                        >
                          {phase.description}
                        </motion.div>
                      )}
                    </div>
                    
                    <Icon className="w-4 h-4 sm:hidden" />
                    
                    {/* Active indicator */}
                    {isCurrent && (
                      <motion.div
                        layoutId="activePhase"
                        className="absolute inset-0 rounded-xl border-2 border-primary-foreground/30"
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                  </motion.button>

                  {index < subPhases.length - 1 && (
                    <div className="mx-3 flex items-center">
                      <motion.div
                        className={cn(
                          "h-0.5 w-8 md:w-12 rounded-full transition-colors duration-500",
                          isCompleted(phase.id) 
                            ? "bg-gradient-to-r from-primary to-accent" 
                            : "bg-border"
                        )}
                      />
                      <motion.div
                        initial={false}
                        animate={{ 
                          scale: isCompleted(phase.id) ? 1 : 0.5,
                          opacity: isCompleted(phase.id) ? 1 : 0.3
                        }}
                        className={cn(
                          "w-2 h-2 rounded-full mx-1",
                          isCompleted(phase.id) ? "bg-accent" : "bg-border"
                        )}
                      />
                      <motion.div
                        className={cn(
                          "h-0.5 w-8 md:w-12 rounded-full transition-colors duration-500",
                          currentSubPhase === 2 || phase2Completed
                            ? "bg-gradient-to-r from-accent to-primary" 
                            : "bg-border"
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Transition Animation */}
      <AnimatePresence>
        {showTransition && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/95 backdrop-blur-xl z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 30 }}
              className="max-w-md w-full"
            >
              <Card className="glass border-primary/30 overflow-hidden relative">
                {/* Animated background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <motion.div
                    className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-primary/20 blur-3xl"
                    animate={{ 
                      scale: [1, 1.2, 1],
                      opacity: [0.3, 0.5, 0.3]
                    }}
                    transition={{ duration: 3, repeat: Infinity }}
                  />
                  <motion.div
                    className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-accent/20 blur-3xl"
                    animate={{ 
                      scale: [1.2, 1, 1.2],
                      opacity: [0.3, 0.5, 0.3]
                    }}
                    transition={{ duration: 3, repeat: Infinity }}
                  />
                </div>

                {/* Floating particles */}
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1.5 h-1.5 rounded-full bg-primary/60"
                    style={{
                      left: `${10 + Math.random() * 80}%`,
                      top: `${10 + Math.random() * 80}%`,
                    }}
                    animate={{
                      y: [0, -20, 0],
                      opacity: [0.3, 0.8, 0.3],
                      scale: [0.8, 1.2, 0.8]
                    }}
                    transition={{
                      duration: 2 + Math.random() * 2,
                      delay: i * 0.2,
                      repeat: Infinity,
                    }}
                  />
                ))}

                <CardContent className="p-8 text-center relative">
                  {/* Success Icon */}
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.1 }}
                    className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary via-primary to-accent flex items-center justify-center shadow-xl shadow-primary/30"
                  >
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    >
                      <Sparkles className="w-10 h-10 text-primary-foreground" />
                    </motion.div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <h3 className="text-2xl font-bold mb-3 text-gradient">市场分析完成！</h3>
                    <p className="text-muted-foreground mb-8 leading-relaxed">
                      接下来添加 Amazon 竞品链接，<br/>获取真实用户反馈与评论数据
                    </p>
                  </motion.div>

                  {/* Feature hints */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="flex justify-center gap-4 mb-8"
                  >
                    {[
                      { icon: Globe, label: "全球数据" },
                      { icon: Target, label: "精准分析" },
                      { icon: Zap, label: "AI 洞察" },
                    ].map((item, i) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 + i * 0.1 }}
                        className="flex flex-col items-center gap-1"
                      >
                        <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
                          <item.icon className="w-5 h-5 text-primary" />
                        </div>
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                      </motion.div>
                    ))}
                  </motion.div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowTransition(false)}
                      className="flex-1 border-border/50 hover:bg-muted/50"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      返回修改
                    </Button>
                    <Button
                      onClick={handleTransitionConfirm}
                      className="flex-1 bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-lg shadow-primary/25"
                    >
                      进入竞品分析
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
      <div className="flex-1 min-h-0 overflow-hidden w-full">
        <AnimatePresence mode="wait">
          {currentSubPhase === 1 && (
            <motion.div
              key="subphase1"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full min-h-0 w-full"
            >
              <MarketAnalysisPhase
                projectId={projectId}
                onComplete={handleMarketAnalysisComplete}
                onSkip={handleMarketAnalysisSkip}
              />
            </motion.div>
          )}

          {currentSubPhase === 2 && (
            <motion.div
              key="subphase2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full min-h-0 w-full"
            >
              <CompetitorResearch
                projectId={projectId}
                onComplete={handleCompetitorResearchComplete}
                onSkip={handleCompetitorResearchSkip}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
