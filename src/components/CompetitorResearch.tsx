import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Loader2, ArrowRight, SkipForward, Link, BarChart3, Package, Star, ExternalLink, Trash2, RotateCcw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { CompetitorCard, CompetitorProduct } from "@/components/CompetitorCard";
import { ReviewAnalysisSummary, ReviewAnalysis } from "@/components/ReviewAnalysisSummary";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CompetitorResearchProps {
  projectId: string;
  onComplete: (hasResearch: boolean) => void;
  onSkip: () => void;
}

function isAmazonUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes("amazon.com") || 
         lowerUrl.includes("amazon.co.") || 
         lowerUrl.includes("amazon.de") ||
         lowerUrl.includes("amazon.fr") ||
         lowerUrl.includes("amazon.it") ||
         lowerUrl.includes("amazon.es") ||
         lowerUrl.includes("amazon.ca") ||
         lowerUrl.includes("amazon.co.uk") ||
         lowerUrl.includes("amazon.co.jp") ||
         lowerUrl.includes("amazon.in");
}

export function CompetitorResearch({ projectId, onComplete, onSkip }: CompetitorResearchProps) {
  const [urlInput, setUrlInput] = useState("");
  const [products, setProducts] = useState<CompetitorProduct[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ReviewAnalysis | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState(0);

  const generateAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-reviews", {
        body: { projectId },
      });

      if (error) throw error;

      if (data.success && data.analysis) {
        setAnalysis(data.analysis);
      }
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [projectId]);

  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from("competitor_products")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load competitor products:", error);
      return;
    }

    const mappedProducts: CompetitorProduct[] = (data || []).map(p => ({
      id: p.id,
      url: p.url,
      platform: p.platform,
      product_title: p.product_title || undefined,
      price: p.price || undefined,
      rating: p.rating ? Number(p.rating) : undefined,
      review_count: p.review_count || undefined,
      status: p.status as CompetitorProduct["status"],
    }));

    setProducts(mappedProducts);
    
    const completedProducts = (data || []).filter(p => p.status === "completed");
    if (completedProducts.length > 0) {
      await generateAnalysis();
    }
  }, [projectId, generateAnalysis]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;

    try {
      new URL(urlInput);
    } catch {
      toast.error("请输入有效的URL");
      return;
    }

    if (!isAmazonUrl(urlInput)) {
      toast.error("目前仅支持 Amazon 产品链接");
      return;
    }

    setIsAdding(true);

    try {
      const { data, error } = await supabase
        .from("competitor_products")
        .insert({
          project_id: projectId,
          url: urlInput.trim(),
          platform: "amazon",
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      const newProduct: CompetitorProduct = {
        id: data.id,
        url: data.url,
        platform: data.platform,
        status: data.status as CompetitorProduct["status"],
      };
      setProducts(prev => [newProduct, ...prev]);
      setUrlInput("");
      
      scrapeProduct(data.id, urlInput.trim());
    } catch (error) {
      console.error("Failed to add URL:", error);
      toast.error("添加链接失败");
    } finally {
      setIsAdding(false);
    }
  };

  const scrapeProduct = async (productId: string, url: string) => {
    setProducts(prev =>
      prev.map(p => (p.id === productId ? { ...p, status: "scraping" as const } : p))
    );
    setIsScraping(true);
    setScrapeProgress(10);

    try {
      const progressInterval = setInterval(() => {
        setScrapeProgress(prev => {
          if (prev >= 85) {
            clearInterval(progressInterval);
            return 85;
          }
          return prev + Math.random() * 15;
        });
      }, 800);

      const { data, error } = await supabase.functions.invoke("scrape-competitor", {
        body: { productId, url },
      });

      clearInterval(progressInterval);

      if (error) throw error;

      if (data.success) {
        setScrapeProgress(100);
        await loadProducts();
        toast.success("产品信息抓取成功");
      } else {
        throw new Error(data.error || "Scraping failed");
      }
    } catch (error) {
      console.error("Scrape failed:", error);
      await supabase
        .from("competitor_products")
        .update({ status: "failed" })
        .eq("id", productId);
      
      setProducts(prev =>
        prev.map(p => (p.id === productId ? { ...p, status: "failed" as const } : p))
      );
      toast.error("抓取失败，请检查链接是否正确");
    } finally {
      setIsScraping(false);
      setTimeout(() => setScrapeProgress(0), 500);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await supabase.from("competitor_products").delete().eq("id", id);
      setProducts(prev => prev.filter(p => p.id !== id));
      toast.success("已删除");
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("删除失败");
    }
  };

  const handleRetry = (id: string) => {
    const product = products.find(p => p.id === id);
    if (product) {
      scrapeProduct(id, product.url);
    }
  };

  const handleComplete = async () => {
    await supabase
      .from("projects")
      .update({ competitor_research_completed: true })
      .eq("id", projectId);

    const completedProducts = products.filter(p => p.status === "completed");
    onComplete(completedProducts.length > 0);
  };

  const completedCount = products.filter(p => p.status === "completed").length;
  const scrapingCount = products.filter(p => p.status === "scraping" || p.status === "pending").length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full overflow-y-auto"
    >
      <div className="max-w-3xl mx-auto px-6 py-8 pb-32 space-y-8">
        {/* Compact Hero Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-5"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="w-14 h-14 bg-gradient-to-br from-accent/20 to-primary/20 rounded-xl flex items-center justify-center border border-accent/20 shadow-md flex-shrink-0"
          >
            <Search className="w-7 h-7 text-accent" />
          </motion.div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold">
              <span className="text-gradient">竞品分析</span>
              <span className="text-muted-foreground text-base font-normal ml-2">(可选)</span>
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              添加 Amazon 竞品链接，获取产品信息和用户评论
            </p>
          </div>
        </motion.div>

        {/* URL Input Card - Simplified */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-dashed border-2 border-accent/30 bg-accent/5">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Link className="w-4 h-4 text-accent" />
                  </div>
                  <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="粘贴 Amazon 产品链接"
                    className="pl-14 h-11 bg-background/50 border-border/50 focus:border-accent"
                    onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
                  />
                </div>
                <Button 
                  onClick={handleAddUrl} 
                  disabled={isAdding || !urlInput.trim()}
                  className="h-11 px-5 bg-gradient-to-r from-accent to-primary hover:opacity-90"
                >
                  {isAdding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span className="ml-2">添加</span>
                </Button>
              </div>
              
              {/* Supported platforms hint - Compact */}
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30">
                <span className="text-xs text-muted-foreground">支持：</span>
                <div className="px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-500 text-xs font-medium">
                  Amazon
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Progress indicator */}
        <AnimatePresence>
          {(isScraping || isAnalyzing) && (
            <motion.div
              initial={{ opacity: 0, y: 20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -20, height: 0 }}
            >
              <Card className="border-accent/30 bg-gradient-to-r from-accent/5 to-primary/5 overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center">
                      {isScraping ? (
                        <Package className="w-6 h-6 text-primary-foreground animate-pulse" />
                      ) : (
                        <BarChart3 className="w-6 h-6 text-primary-foreground animate-pulse" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">
                        {isScraping ? "正在抓取产品信息..." : "正在分析评论数据..."}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {isScraping 
                          ? "正在从 Amazon 获取产品详情和用户评论" 
                          : "AI 正在提取痛点与需求洞察"}
                      </p>
                    </div>
                    <div className="text-2xl font-bold text-accent">
                      {Math.round(isScraping ? scrapeProgress : 50)}%
                    </div>
                  </div>
                  <Progress value={isScraping ? scrapeProgress : 50} className="h-2" />
                  
                  {/* Steps */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      { label: "产品信息", done: scrapeProgress > 30 },
                      { label: "价格数据", done: scrapeProgress > 50 },
                      { label: "用户评论", done: scrapeProgress > 70 },
                      { label: "数据整理", done: scrapeProgress > 90 },
                    ].map((step, i) => (
                      <motion.div
                        key={step.label}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.1 }}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs",
                          step.done 
                            ? "bg-accent/20 text-accent" 
                            : "bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {step.done ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        )}
                        {step.label}
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State - Compact */}
        {products.length === 0 && !isScraping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center py-8"
          >
            <div className="w-16 h-16 mx-auto mb-3 rounded-xl bg-muted/50 flex items-center justify-center">
              <Package className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">添加 Amazon 竞品链接开始分析</p>
          </motion.div>
        )}

        {/* Product list */}
        <AnimatePresence mode="popLayout">
          {products.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Package className="w-4 h-4 text-accent" />
                  已添加的竞品
                </h4>
                <span className={cn(
                  "text-sm px-3 py-1 rounded-full",
                  completedCount === products.length 
                    ? "bg-green-500/10 text-green-500" 
                    : "bg-muted text-muted-foreground"
                )}>
                  {completedCount}/{products.length} 完成
                </span>
              </div>
              
              <div className="grid gap-3">
                {products.map((product, index) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <CompetitorCard
                      product={product}
                      onDelete={handleDelete}
                      onRetry={handleRetry}
                    />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Analysis summary */}
        {analysis && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <ReviewAnalysisSummary analysis={analysis} className="border-primary/20" />
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex justify-between items-center pt-6 border-t border-border/30"
        >
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground hover:text-foreground">
            <SkipForward className="w-4 h-4 mr-2" />
            跳过此步骤
          </Button>
          <Button
            onClick={handleComplete}
            disabled={scrapingCount > 0}
            className="bg-gradient-to-r from-accent to-primary hover:opacity-90 shadow-lg shadow-accent/25"
            size="lg"
          >
            {scrapingCount > 0 ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                正在抓取 ({scrapingCount})
              </>
            ) : (
              <>
                进入产品定义
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
