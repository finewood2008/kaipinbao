import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Loader2, ArrowRight, SkipForward, Sparkles, Target, Users, DollarSign, Lightbulb, BarChart3, PieChart, Rocket, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  ResponsiveContainer,
  Tooltip,
  Legend,
  RadialBarChart,
  RadialBar,
} from "recharts";
import { cn } from "@/lib/utils";

interface MarketAnalysisPhaseProps {
  projectId: string;
  onComplete: () => void;
  onSkip: () => void;
}

interface InitialMarketAnalysis {
  marketSize: string;
  targetUserProfile: string;
  competitionLandscape: string;
  pricingStrategy: string;
  differentiationOpportunities: string[];
  generatedAt: string;
  marketSizeData?: {
    current: number;
    projected: number;
    growth: number;
    unit: string;
  };
  userSegments?: {
    name: string;
    percentage: number;
  }[];
  pricingDistribution?: {
    range: string;
    count: number;
    color: string;
  }[];
  competitorRatings?: {
    category: string;
    ourScore: number;
    competitorAvg: number;
  }[];
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

export function MarketAnalysisPhase({ projectId, onComplete, onSkip }: MarketAnalysisPhaseProps) {
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<InitialMarketAnalysis | null>(null);
  const [progress, setProgress] = useState(0);

  const loadProjectData = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("name, description, prd_data")
      .eq("id", projectId)
      .single();

    if (data) {
      setProjectName(data.name);
      setProjectDescription(data.description || "");
      
      const prdData = data.prd_data as Record<string, unknown> | null;
      if (prdData?.initialMarketAnalysis) {
        setAnalysis(prdData.initialMarketAnalysis as InitialMarketAnalysis);
      }
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  const handleStartAnalysis = async () => {
    setIsAnalyzing(true);
    setProgress(10);

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 85) {
            clearInterval(progressInterval);
            return 85;
          }
          return prev + Math.random() * 15;
        });
      }, 500);

      const { data, error } = await supabase.functions.invoke("initial-market-analysis", {
        body: { projectId },
      });

      clearInterval(progressInterval);

      if (error) throw error;

      if (data.success && data.analysis) {
        setProgress(100);
        setAnalysis(data.analysis);
        toast.success("市场分析完成");
      } else {
        throw new Error(data.error || "Analysis failed");
      }
    } catch (error) {
      console.error("Market analysis failed:", error);
      toast.error("市场分析失败，请重试");
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => setProgress(0), 500);
    }
  };

  const handleComplete = () => {
    onComplete();
  };

  const getMarketSizeChartData = () => {
    if (analysis?.marketSizeData) {
      return [
        { name: "当前规模", value: analysis.marketSizeData.current, fill: CHART_COLORS[0] },
        { name: "预测增长", value: analysis.marketSizeData.projected - analysis.marketSizeData.current, fill: CHART_COLORS[1] },
      ];
    }
    return [
      { name: "当前规模", value: 85, fill: CHART_COLORS[0] },
      { name: "预测增长", value: 35, fill: CHART_COLORS[1] },
    ];
  };

  const getUserSegmentData = () => {
    if (analysis?.userSegments) {
      return analysis.userSegments.map((seg, i) => ({
        ...seg,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }));
    }
    return [
      { name: "商务人士", percentage: 35, fill: CHART_COLORS[0] },
      { name: "年轻白领", percentage: 30, fill: CHART_COLORS[1] },
      { name: "户外运动", percentage: 20, fill: CHART_COLORS[2] },
      { name: "其他", percentage: 15, fill: CHART_COLORS[3] },
    ];
  };

  const getPricingData = () => {
    if (analysis?.pricingDistribution) {
      return analysis.pricingDistribution;
    }
    return [
      { range: "$0-30", count: 15, color: CHART_COLORS[2] },
      { range: "$30-60", count: 35, color: CHART_COLORS[0] },
      { range: "$60-100", count: 30, color: CHART_COLORS[1] },
      { range: "$100+", count: 20, color: CHART_COLORS[4] },
    ];
  };

  const getCompetitorData = () => {
    if (analysis?.competitorRatings) {
      return analysis.competitorRatings;
    }
    return [
      { category: "功能", ourScore: 85, competitorAvg: 70 },
      { category: "设计", ourScore: 90, competitorAvg: 65 },
      { category: "价格", ourScore: 75, competitorAvg: 80 },
      { category: "品质", ourScore: 88, competitorAvg: 72 },
    ];
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full w-full overflow-y-auto"
    >
      <div className="max-w-4xl mx-auto px-6 py-8 pb-32 space-y-10">
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
            className="w-14 h-14 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center border border-primary/20 shadow-md flex-shrink-0"
          >
            <TrendingUp className="w-7 h-7 text-primary" />
          </motion.div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gradient">AI 市场分析</h2>
            <p className="text-muted-foreground text-sm mt-1">
              分析市场格局、目标用户和差异化机会
            </p>
          </div>
        </motion.div>

        {/* Project Info - Compact */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-border/40">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Rocket className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs text-muted-foreground">项目：</span>
                    <span className="font-semibold">{projectName}</span>
                  </div>
                  {projectDescription && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{projectDescription}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Progress/Loading State */}
        <AnimatePresence>
          {isAnalyzing && (
            <motion.div
              initial={{ opacity: 0, y: 20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -20, height: 0 }}
            >
              <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5 overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-primary-foreground animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">AI 市场专家正在分析...</h4>
                      <p className="text-sm text-muted-foreground">正在分析市场规模、用户画像、竞争格局和定价策略</p>
                    </div>
                    <div className="text-2xl font-bold text-primary">{Math.round(progress)}%</div>
                  </div>
                  <Progress value={progress} className="h-2" />
                  
                  {/* Analysis steps */}
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { label: "市场规模", done: progress > 20 },
                      { label: "用户画像", done: progress > 40 },
                      { label: "竞争分析", done: progress > 60 },
                      { label: "定价策略", done: progress > 80 },
                    ].map((step, i) => (
                      <motion.div
                        key={step.label}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.1 }}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs",
                          step.done 
                            ? "bg-primary/20 text-primary" 
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

        {/* Start Analysis CTA */}
        {!analysis && !isAnalyzing && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center gap-4"
          >
            <Card className="w-full max-w-md border-dashed border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer group"
              onClick={handleStartAnalysis}
            >
              <CardContent className="p-8 text-center">
                <motion.div
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/25 group-hover:shadow-primary/40 transition-shadow"
                >
                  <Sparkles className="w-8 h-8 text-primary-foreground" />
                </motion.div>
                <h3 className="text-lg font-semibold mb-2">开始 AI 市场分析</h3>
                <p className="text-sm text-muted-foreground">
                  点击启动智能分析，获取市场洞察与机会评估
                </p>
              </CardContent>
            </Card>
            
            <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
              <SkipForward className="w-4 h-4 mr-1" />
              跳过此步骤
            </Button>
          </motion.div>
        )}

        {/* Analysis Results */}
        <AnimatePresence>
          {analysis && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Charts Grid - 2x2 Layout with more spacing */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Market Size Chart */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <Card className="h-full bg-gradient-to-br from-primary/5 via-transparent to-accent/5 border-primary/20 hover:border-primary/30 transition-colors">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <BarChart3 className="w-4 h-4 text-primary" />
                        </div>
                        市场规模趋势
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadialBarChart 
                            cx="50%" 
                            cy="50%" 
                            innerRadius="30%" 
                            outerRadius="90%" 
                            data={getMarketSizeChartData()}
                            startAngle={180}
                            endAngle={0}
                          >
                            <RadialBar
                              dataKey="value"
                              cornerRadius={10}
                              background={{ fill: "hsl(var(--muted))" }}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: "hsl(var(--card))", 
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "12px",
                              }}
                            />
                            <Legend 
                              iconSize={8} 
                              wrapperStyle={{ fontSize: "12px" }}
                            />
                          </RadialBarChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-xs text-muted-foreground text-center mt-2 px-4">
                        预计年增长率 15-25%
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* User Segments Pie Chart */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Card className="h-full bg-gradient-to-br from-accent/5 via-transparent to-primary/5 border-accent/20 hover:border-accent/30 transition-colors">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                          <PieChart className="w-4 h-4 text-accent" />
                        </div>
                        目标用户分布
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={getUserSegmentData()}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={75}
                              paddingAngle={3}
                              dataKey="percentage"
                              label={({ name, percentage }) => `${percentage}%`}
                              labelLine={false}
                            >
                              {getUserSegmentData().map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: "hsl(var(--card))", 
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "12px",
                              }}
                            />
                            <Legend 
                              iconSize={8}
                              wrapperStyle={{ fontSize: "11px" }}
                            />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Pricing Distribution */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card className="h-full border-border/50 hover:border-primary/30 transition-colors">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                          <DollarSign className="w-4 h-4 text-green-500" />
                        </div>
                        市场定价分布
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={getPricingData()} layout="vertical">
                            <XAxis type="number" hide />
                            <YAxis 
                              type="category" 
                              dataKey="range" 
                              width={55}
                              tick={{ fontSize: 11 }}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: "hsl(var(--card))", 
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "12px",
                              }}
                              formatter={(value: number) => [`${value}%`, "占比"]}
                            />
                            <Bar 
                              dataKey="count" 
                              radius={[0, 6, 6, 0]}
                            >
                              {getPricingData().map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-xs text-muted-foreground text-center mt-2 line-clamp-2">
                        {analysis.pricingStrategy}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Competition Comparison */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <Card className="h-full border-border/50 hover:border-accent/30 transition-colors">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                          <TrendingUp className="w-4 h-4 text-orange-500" />
                        </div>
                        竞争力对比
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={getCompetitorData()}>
                            <XAxis 
                              dataKey="category" 
                              tick={{ fontSize: 11 }}
                            />
                            <YAxis 
                              domain={[0, 100]}
                              tick={{ fontSize: 11 }}
                              width={30}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: "hsl(var(--card))", 
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "12px",
                              }}
                            />
                            <Legend 
                              wrapperStyle={{ fontSize: "11px" }}
                            />
                            <Bar 
                              dataKey="ourScore" 
                              name="我们" 
                              fill="hsl(var(--primary))" 
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar 
                              dataKey="competitorAvg" 
                              name="竞品" 
                              fill="hsl(var(--muted-foreground))" 
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              {/* Text Analysis Cards */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {/* Market Size Text */}
                <Card className="group hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                        <Target className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold mb-2">市场规模评估</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                          {analysis.marketSize}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Target User */}
                <Card className="group hover:border-accent/30 transition-all hover:shadow-lg hover:shadow-accent/5">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                        <Users className="w-6 h-6 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold mb-2">目标用户画像</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                          {analysis.targetUserProfile}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Differentiation Opportunities */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-accent/5">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                        <Lightbulb className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold mb-3">差异化机会</h4>
                        <div className="flex flex-wrap gap-2">
                          {analysis.differentiationOpportunities?.map((opp, i) => (
                            <motion.span
                              key={i}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.7 + i * 0.1 }}
                              className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm border border-primary/20"
                            >
                              {opp}
                            </motion.span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="flex justify-between items-center pt-4 border-t border-border/30"
              >
                <Button variant="ghost" onClick={handleStartAnalysis} disabled={isAnalyzing}>
                  <RefreshCw className={cn("w-4 h-4 mr-2", isAnalyzing && "animate-spin")} />
                  重新分析
                </Button>
                <Button 
                  onClick={handleComplete}
                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-lg shadow-primary/25"
                  size="lg"
                >
                  继续下一步
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
