import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProjectCard } from "@/components/ProjectCard";
import { PrdDocumentModal } from "@/components/PrdDocumentModal";
import { PrdData } from "@/components/PrdExtractionSidebar";
import { checkAllRequiredFilled } from "@/components/PrdPhase";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogOut, Plus, Search, Sparkles, Loader2, Globe, Eye, Mail, Filter, Trash2, Archive, X, CheckSquare, RefreshCw, AlertCircle, FolderOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import logoImage from "@/assets/logo.png";
import { cn } from "@/lib/utils";

interface LandingPageData {
  id: string;
  slug: string;
  is_published: boolean;
  hero_image_url: string | null;
  screenshot_url: string | null;
  view_count: number;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  current_stage: number;
  status: string;
  created_at: string;
  cover_image_url: string | null;
  product_images: string[];
  landing_page: LandingPageData | null;
  email_count: number;
  prd_data: PrdData | null;
}

interface LandingPageRow {
  id: string;
  project_id: string;
  slug: string;
  is_published: boolean;
  hero_image_url: string | null;
  screenshot_url: string | null;
  view_count: number;
  is_active: boolean;
}

interface ImageRow {
  project_id: string;
  image_url: string;
  image_type: string;
  is_selected: boolean;
  created_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  current_stage: number;
  status: string;
  created_at: string;
  cover_image_url: string | null;
  prd_data: unknown;
}

type StageFilter = "all" | 1 | 2 | 3 | 4;
type StatusFilter = "all" | "active" | "completed" | "archived";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  
  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchArchiving, setIsBatchArchiving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  
  // PRD Document Modal state
  const [selectedProjectPrd, setSelectedProjectPrd] = useState<{
    projectId: string;
    projectName: string;
    prdData: PrdData;
  } | null>(null);

  const fetchProjectsData = async (): Promise<Project[]> => {
    // NOTE: Avoid heavy nested selects (can trigger DB statement timeout).
    // Fetch projects first, then fetch landing pages / images in separate queries.
    const { data: projectsData, error: projectsError } = await supabase
      .from("projects")
      .select(
        "id,name,description,current_stage,status,created_at,cover_image_url,prd_data"
      )
      .order("created_at", { ascending: false });

    if (projectsError) throw projectsError;

    const projectIds = (projectsData || []).map((p) => p.id);

    // Fetch active landing page per project
    let landingPagesData: LandingPageRow[] = [];
    if (projectIds.length > 0) {
      const { data, error: landingPagesError } = await supabase
        .from("landing_pages")
        .select(
          "id,project_id,slug,is_published,hero_image_url,screenshot_url,view_count,is_active"
        )
        .in("project_id", projectIds)
        .eq("is_active", true);

      if (landingPagesError) throw landingPagesError;
      landingPagesData = data || [];
    }

    const activeLandingPageByProjectId = new Map<string, LandingPageRow>();
    landingPagesData.forEach((lp: LandingPageRow) => {
      if (!activeLandingPageByProjectId.has(lp.project_id)) {
        activeLandingPageByProjectId.set(lp.project_id, lp);
      }
    });

    // Fetch product images for all projects
    let imagesData: ImageRow[] = [];
    if (projectIds.length > 0) {
      const { data, error: imagesError } = await supabase
        .from("generated_images")
        .select("project_id,image_url,image_type,is_selected,created_at")
        .in("project_id", projectIds)
        .eq("image_type", "product")
        .order("created_at", { ascending: false });

      if (imagesError) throw imagesError;
      imagesData = data || [];
    }

    const imagesByProjectId = new Map<string, ImageRow[]>();
    imagesData.forEach((img: ImageRow) => {
      const arr = imagesByProjectId.get(img.project_id) || [];
      arr.push(img);
      imagesByProjectId.set(img.project_id, arr);
    });

    // Fetch email counts for all active landing pages
    const landingPageIds = landingPagesData.map((lp: LandingPageRow) => lp.id);
    let emailCounts: Record<string, number> = {};
    if (landingPageIds.length > 0) {
      const { data: emailData, error: emailError } = await supabase
        .from("email_submissions")
        .select("landing_page_id")
        .in("landing_page_id", landingPageIds);

      if (emailError) throw emailError;

      if (emailData) {
        emailCounts = emailData.reduce((acc: Record<string, number>, item) => {
          acc[item.landing_page_id] = (acc[item.landing_page_id] || 0) + 1;
          return acc;
        }, {});
      }
    }

    return (projectsData || []).map((p: ProjectRow) => {
      const allImages = imagesByProjectId.get(p.id) || [];
      const selectedImages = allImages
        .filter((img: ImageRow) => img.is_selected)
        .map((img: ImageRow) => img.image_url);
      const otherImages = allImages
        .filter((img: ImageRow) => !img.is_selected)
        .map((img: ImageRow) => img.image_url);
      const productImages = [...selectedImages, ...otherImages].slice(0, 4);

      const activeLandingPage = activeLandingPageByProjectId.get(p.id) || null;

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        current_stage: p.current_stage,
        status: p.status,
        created_at: p.created_at,
        cover_image_url: p.cover_image_url || productImages[0] || null,
        product_images: productImages,
        landing_page: activeLandingPage,
        email_count: activeLandingPage ? (emailCounts[activeLandingPage.id] || 0) : 0,
        prd_data: p.prd_data as PrdData | null,
      };
    });
  };

  const { data: projects = [], isLoading, error: loadErrorObj, refetch } = useQuery({
    queryKey: ['dashboard-projects'],
    queryFn: fetchProjectsData,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const loadError = loadErrorObj ? (loadErrorObj as Error).message || "获取项目失败，请稍后重试" : null;

  const handleCreateProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsCreating(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        description: description || null,
        user_id: user?.id,
      })
      .select()
      .single();

    setIsCreating(false);

    if (error) {
      toast.error("创建项目失败");
      console.error(error);
    } else {
      toast.success("项目创建成功！");
      setIsDialogOpen(false);
      navigate(`/project/${data.id}`);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (error) {
      toast.error("删除项目失败");
      console.error(error);
    } else {
      toast.success("项目已删除");
      queryClient.setQueryData(['dashboard-projects'], (old: Project[] | undefined) =>
        (old || []).filter(p => p.id !== projectId)
      );
    }
  };

  const handleUpdateProject = async (projectId: string, updates: { name?: string; description?: string }) => {
    const { error } = await supabase
      .from("projects")
      .update({
        name: updates.name,
        description: updates.description || null,
      })
      .eq("id", projectId);

    if (error) {
      toast.error("更新项目失败");
      console.error(error);
      throw error;
    }

    queryClient.setQueryData(['dashboard-projects'], (old: Project[] | undefined) =>
      (old || []).map(p => 
        p.id === projectId 
          ? { ...p, name: updates.name || p.name, description: updates.description || null }
          : p
      )
    );
  };

  const handleCaptureScreenshot = async (projectId: string, landingPageId: string, slug: string) => {
    const { data, error } = await supabase.functions.invoke('capture-landing-screenshot', {
      body: { landingPageId, slug },
    });

    if (error || !data?.success) {
      console.error('Screenshot capture error:', error || data?.error);
      throw new Error(data?.error || 'Failed to capture screenshot');
    }

    queryClient.setQueryData(['dashboard-projects'], (old: Project[] | undefined) =>
      (old || []).map(p => 
        p.id === projectId && p.landing_page
          ? { ...p, landing_page: { ...p.landing_page, screenshot_url: data.screenshotUrl } }
          : p
      )
    );
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  // Calculate stats
  const stats = useMemo(() => {
    const totalViews = projects.reduce((sum, p) => sum + (p.landing_page?.view_count || 0), 0);
    const totalEmails = projects.reduce((sum, p) => sum + p.email_count, 0);
    const publishedPages = projects.filter(p => p.landing_page?.is_published).length;
    
    return {
      total: projects.length,
      active: projects.filter(p => p.status === "active").length,
      completed: projects.filter(p => p.status === "completed").length,
      archived: projects.filter(p => p.status === "archived").length,
      publishedPages,
      totalViews,
      totalEmails,
    };
  }, [projects]);

  // Filter projects - MUST be before batch operations that depend on it
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStage = stageFilter === "all" || p.current_stage === stageFilter;
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      
      return matchesSearch && matchesStage && matchesStatus;
    });
  }, [projects, searchQuery, stageFilter, statusFilter]);

  // Batch operations
  const toggleSelectProject = useCallback((projectId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map(p => p.id)));
    }
  }, [filteredProjects, selectedIds.size]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIsBatchMode(false);
  }, []);

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    
    setIsBatchDeleting(true);
    const idsToDelete = Array.from(selectedIds);
    
    const { error } = await supabase
      .from("projects")
      .delete()
      .in("id", idsToDelete);

    if (error) {
      toast.error("批量删除失败");
      console.error(error);
    } else {
      toast.success(`已删除 ${idsToDelete.length} 个项目`);
      queryClient.setQueryData(['dashboard-projects'], (old: Project[] | undefined) =>
        (old || []).filter(p => !selectedIds.has(p.id))
      );
      clearSelection();
    }
    
    setIsBatchDeleting(false);
    setShowDeleteConfirm(false);
  };

  const handleBatchArchive = async () => {
    if (selectedIds.size === 0) return;
    
    setIsBatchArchiving(true);
    const idsToArchive = Array.from(selectedIds);
    
    const { error } = await supabase
      .from("projects")
      .update({ status: "archived" })
      .in("id", idsToArchive);

    if (error) {
      toast.error("批量归档失败");
      console.error(error);
    } else {
      toast.success(`已归档 ${idsToArchive.length} 个项目`);
      queryClient.setQueryData(['dashboard-projects'], (old: Project[] | undefined) =>
        (old || []).map(p => selectedIds.has(p.id) ? { ...p, status: "archived" } : p)
      );
      clearSelection();
    }
    
    setIsBatchArchiving(false);
    setShowArchiveConfirm(false);
  };

  const handleBatchUnarchive = async () => {
    if (selectedIds.size === 0) return;
    
    const idsToUnarchive = Array.from(selectedIds);
    
    const { error } = await supabase
      .from("projects")
      .update({ status: "active" })
      .in("id", idsToUnarchive);

    if (error) {
      toast.error("取消归档失败");
      console.error(error);
    } else {
      toast.success(`已恢复 ${idsToUnarchive.length} 个项目`);
      queryClient.setQueryData(['dashboard-projects'], (old: Project[] | undefined) =>
        (old || []).map(p => selectedIds.has(p.id) ? { ...p, status: "active" } : p)
      );
      clearSelection();
    }
  };

  // Check if any selected projects are archived
  const hasArchivedSelected = useMemo(() => {
    return Array.from(selectedIds).some(id => {
      const project = projects.find(p => p.id === id);
      return project?.status === "archived";
    });
  }, [selectedIds, projects]);

  const hasActiveSelected = useMemo(() => {
    return Array.from(selectedIds).some(id => {
      const project = projects.find(p => p.id === id);
      return project?.status !== "archived";
    });
  }, [selectedIds, projects]);

  // Check if project has complete PRD document
  const hasPrdDocument = useCallback((project: Project) => {
    return project.prd_data && checkAllRequiredFilled(project.prd_data);
  }, []);

  // Handle opening PRD document
  const handleOpenPrdDocument = useCallback((project: Project) => {
    if (project.prd_data) {
      setSelectedProjectPrd({
        projectId: project.id,
        projectName: project.name,
        prdData: project.prd_data,
      });
    }
  }, []);

  const stageFilters = [
    { value: "all" as const, label: "全部阶段" },
    { value: 1 as const, label: "市场调研" },
    { value: 2 as const, label: "产品定义" },
    { value: 3 as const, label: "视觉生成" },
    { value: 4 as const, label: "落地页" },
  ];

  const statusFilters = [
    { value: "all" as const, label: "全部状态" },
    { value: "active" as const, label: "进行中" },
    { value: "completed" as const, label: "已完成" },
    { value: "archived" as const, label: "已归档" },
  ];

  return (
    <div className="min-h-screen bg-gradient-dark">
      {/* Header */}
      <header className="border-b border-border/50 glass sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src={logoImage} alt="开品宝" className="h-10" />
            <span className="text-xl font-bold text-foreground">开品宝</span>
            <span className="text-xs text-muted-foreground hidden md:block">产品研发工作台</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden md:block">
              {user?.email}
            </span>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8"
        >
          {[
            { label: "全部项目", value: stats.total, icon: null },
            { label: "进行中", value: stats.active, icon: null },
            { label: "已完成", value: stats.completed, icon: null },
            { label: "已归档", value: stats.archived, icon: null },
            { label: "已发布落地页", value: stats.publishedPages, icon: Globe },
            { label: "总访问量", value: stats.totalViews, icon: Eye },
            { label: "邮件订阅", value: stats.totalEmails, icon: Mail },
          ].map((stat, i) => (
            <div key={stat.label} className="p-4 rounded-xl glass">
              <div className="flex items-center gap-2">
                {stat.icon && <stat.icon className="w-4 h-4 text-muted-foreground" />}
                <motion.p
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="text-2xl font-bold text-gradient"
                >
                  {stat.value}
                </motion.p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Filters and Actions */}
        <div className="flex flex-col gap-4 mb-8">
          {/* Search and Create */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索项目..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-primary glow-primary">
                  <Plus className="w-4 h-4 mr-2" />
                  新建项目
                </Button>
              </DialogTrigger>
              <DialogContent className="glass">
                <DialogHeader>
                  <DialogTitle>创建新产品项目</DialogTitle>
                  <DialogDescription>
                    开始您的产品研发之旅，AI将引导您完成从创意到市场测试的全过程
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateProject} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">项目名称</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="例如：智能保温杯"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">简要描述（可选）</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder="简单描述您想要开发的产品..."
                      rows={3}
                    />
                  </div>
                  <Button type="submit" className="w-full bg-gradient-primary" disabled={isCreating}>
                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    开始研发
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-muted-foreground mr-2">
              <Filter className="w-4 h-4" />
              <span className="text-sm">筛选:</span>
            </div>
            
            {/* Stage Filters */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted/30">
              {stageFilters.map((filter) => (
                <Button
                  key={filter.value}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 text-xs px-3 rounded-md transition-colors",
                    stageFilter === filter.value 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  )}
                  onClick={() => setStageFilter(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>

            <div className="w-px h-6 bg-border mx-2 hidden sm:block" />

            {/* Status Filters */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted/30">
              {statusFilters.map((filter) => (
                <Button
                  key={filter.value}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 text-xs px-3 rounded-md transition-colors",
                    statusFilter === filter.value 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  )}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Batch Mode Toggle */}
          <div className="flex items-center gap-2">
            <Button
              variant={isBatchMode ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                setIsBatchMode(!isBatchMode);
                if (isBatchMode) clearSelection();
              }}
            >
              <CheckSquare className="w-4 h-4 mr-2" />
              {isBatchMode ? "取消批量" : "批量操作"}
            </Button>
          </div>
        </div>

        {/* Batch Action Toolbar */}
        <AnimatePresence>
          {isBatchMode && selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
            >
              <div className="flex items-center gap-3 px-6 py-3 rounded-full glass border border-border/50 shadow-xl">
                <span className="text-sm font-medium">
                  已选择 <span className="text-primary">{selectedIds.size}</span> 个项目
                </span>
                <div className="w-px h-6 bg-border" />
                
                {hasActiveSelected && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowArchiveConfirm(true)}
                    disabled={isBatchArchiving}
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    归档
                  </Button>
                )}
                
                {hasArchivedSelected && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBatchUnarchive}
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    取消归档
                  </Button>
                )}
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isBatchDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除
                </Button>
                
                <div className="w-px h-6 bg-border" />
                
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={clearSelection}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Batch Delete Confirmation */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认批量删除？</AlertDialogTitle>
              <AlertDialogDescription>
                此操作将永久删除 {selectedIds.size} 个项目及其所有相关数据（包括落地页、生成的图片等），且无法恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleBatchDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isBatchDeleting}
              >
                {isBatchDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Batch Archive Confirmation */}
        <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认批量归档？</AlertDialogTitle>
              <AlertDialogDescription>
                将 {selectedIds.size} 个项目移至归档。归档后的项目不会显示在默认视图中，但可以在"已归档"筛选中找到。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleBatchArchive}
                disabled={isBatchArchiving}
              >
                {isBatchArchiving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                确认归档
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Projects List - Single Column */}
        {isLoading ? (
          /* Skeleton Loading State */
          <div className="flex flex-col gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl glass p-4">
                <div className="flex gap-4">
                  <Skeleton className="w-32 h-24 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-4 w-2/3" />
                    <div className="flex gap-2 mt-2">
                      <Skeleton className="h-6 w-16 rounded-full" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-20 rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          /* Error State with Retry */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10 text-destructive" />
            </div>
            <h3 className="text-xl font-semibold mb-2">加载失败</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {loadError}
            </p>
            <Button 
              onClick={() => refetch()} 
              variant="outline"
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              重新加载
            </Button>
          </motion.div>
        ) : filteredProjects.length === 0 ? (
          /* Empty State */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              {searchQuery || stageFilter !== "all" || statusFilter !== "all" 
                ? <Search className="w-10 h-10 text-muted-foreground" />
                : <FolderOpen className="w-10 h-10 text-muted-foreground" />
              }
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {searchQuery || stageFilter !== "all" || statusFilter !== "all" 
                ? "未找到匹配的项目" 
                : "还没有项目"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery || stageFilter !== "all" || statusFilter !== "all"
                ? "尝试调整筛选条件" 
                : "点击「新建项目」开始您的产品研发之旅"}
            </p>
            {!(searchQuery || stageFilter !== "all" || statusFilter !== "all") && (
              <Button 
                onClick={() => setIsDialogOpen(true)}
                className="bg-gradient-primary glow-primary"
              >
                <Plus className="w-4 h-4 mr-2" />
                新建项目
              </Button>
            )}
          </motion.div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Select All Checkbox when in batch mode */}
            {isBatchMode && filteredProjects.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-muted/30">
                <Checkbox
                  checked={selectedIds.size === filteredProjects.length && filteredProjects.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size === filteredProjects.length ? "取消全选" : "全选当前列表"}
                </span>
              </div>
            )}
            
            {filteredProjects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-stretch gap-4"
              >
                {/* Checkbox for batch selection */}
                {isBatchMode && (
                  <div 
                    className={cn(
                      "flex items-center justify-center w-12 rounded-lg transition-colors cursor-pointer",
                      selectedIds.has(project.id) 
                        ? "bg-primary/10 border-2 border-primary" 
                        : "bg-muted/30 border-2 border-transparent hover:border-muted"
                    )}
                    onClick={() => toggleSelectProject(project.id)}
                  >
                    <Checkbox
                      checked={selectedIds.has(project.id)}
                      onCheckedChange={() => toggleSelectProject(project.id)}
                    />
                  </div>
                )}
                
                <div className="flex-1">
                  <ProjectCard
                    id={project.id}
                    name={project.name}
                    description={project.description || undefined}
                    currentStage={project.current_stage}
                    status={project.status}
                    createdAt={project.created_at}
                    coverImage={project.cover_image_url || undefined}
                    productImages={project.product_images}
                    landingPage={project.landing_page ? {
                      slug: project.landing_page.slug,
                      isPublished: project.landing_page.is_published,
                      heroImageUrl: project.landing_page.hero_image_url || undefined,
                      screenshotUrl: project.landing_page.screenshot_url || undefined,
                      viewCount: project.landing_page.view_count,
                      emailCount: project.email_count,
                    } : undefined}
                    hasPrdDocument={hasPrdDocument(project)}
                    onClick={() => isBatchMode ? toggleSelectProject(project.id) : navigate(`/project/${project.id}`)}
                    onDelete={isBatchMode ? undefined : () => handleDeleteProject(project.id)}
                    onUpdate={isBatchMode ? undefined : (updates) => handleUpdateProject(project.id, updates)}
                    onCaptureScreenshot={
                      !isBatchMode && project.landing_page?.is_published 
                        ? () => handleCaptureScreenshot(
                            project.id, 
                            project.landing_page!.id, 
                            project.landing_page!.slug
                          )
                        : undefined
                    }
                    onOpenPrdDocument={() => handleOpenPrdDocument(project)}
                    isSelected={selectedIds.has(project.id)}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* PRD Document Modal for Dashboard - Read Only */}
        {selectedProjectPrd && (
          <PrdDocumentModal
            isOpen={true}
            onClose={() => setSelectedProjectPrd(null)}
            prdData={selectedProjectPrd.prdData}
            projectName={selectedProjectPrd.projectName}
            projectId={selectedProjectPrd.projectId}
            isReadOnly={true}
          />
        )}
      </main>
    </div>
  );
}
