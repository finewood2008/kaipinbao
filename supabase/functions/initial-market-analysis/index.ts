import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper function to verify project ownership
async function verifyProjectOwnership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  userId: string
): Promise<{ error?: string }> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    return { error: "Project not found" };
  }

  if (project.user_id !== userId) {
    return { error: "Forbidden: You don't have access to this project" };
  }

  return {};
}

const SYSTEM_PROMPT = `你是一位资深市场分析专家，拥有15年消费电子和跨境电商行业经验。曾任职于 Nielsen、Euromonitor 等顶级市场研究机构。

基于用户提供的产品概念和描述，进行专业的市场分析。

## 分析维度

1. **市场规模评估**
   - 估算目标市场的规模（全球/区域）
   - 分析增长趋势和驱动因素
   - 识别关键细分市场

2. **目标用户画像**
   - 核心用户群体的人口属性（年龄、性别、收入）
   - 行为特征和购买习惯
   - 心理特征和价值观

3. **竞争格局预判**
   - 主要竞争对手类型（品牌/白牌）
   - 市场集中度分析
   - 进入壁垒评估

4. **定价策略建议**
   - 基于市场定位的价格区间
   - 不同价位段的用户期望
   - 利润空间分析

5. **差异化机会**
   - 基于产品描述的差异化方向
   - 未被满足的用户需求
   - 创新机会点

## 输出格式

请返回以下 JSON 格式（确保是有效的 JSON）：

{
  "marketSize": "对市场规模和增长趋势的详细分析（100-200字）",
  "targetUserProfile": "对目标用户画像的详细描述（100-200字）",
  "competitionLandscape": "对竞争格局的分析和预判（100-200字）",
  "pricingStrategy": "定价策略建议和定价区间（100-150字）",
  "differentiationOpportunities": [
    "差异化机会1",
    "差异化机会2", 
    "差异化机会3"
  ]
}

注意：
- 分析要具体、专业，避免泛泛而谈
- 结合产品类型给出针对性建议
- 如果信息不足，基于行业经验做合理推断
- 只输出 JSON，不要有其他内容`;

// Call Google Gemini API directly (Primary)
async function callGoogleDirect(userPrompt: string): Promise<string> {
  const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GOOGLE_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google API error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("Rate limit exceeded");
    }
    
    throw new Error(`Google API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// Call Lovable AI Gateway (Fallback)
async function callLovableAI(userPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Lovable AI error:", response.status, errorText);
    throw new Error(`Lovable AI error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create client with user's auth token for verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user token and get claims
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { projectId } = await req.json();
    
    if (!projectId) {
      return new Response(
        JSON.stringify({ success: false, error: "Project ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify project ownership
    const ownershipCheck = await verifyProjectOwnership(supabase, projectId, userId);
    if (ownershipCheck.error) {
      return new Response(
        JSON.stringify({ success: false, error: ownershipCheck.error }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get project info
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("name, description, prd_data")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      throw new Error("Project not found");
    }

    console.log("InitialMarketAnalysis: Analyzing project:", project.name);

    // Build user prompt
    const userPrompt = `请分析以下产品项目：

**项目名称**：${project.name}

**项目描述**：${project.description || "暂无详细描述"}

请基于以上信息进行市场分析，返回 JSON 格式结果。`;

    // Primary: Google Direct API
    let content: string;
    let usedFallback = false;

    try {
      console.log("InitialMarketAnalysis: Attempting Google Direct API...");
      content = await callGoogleDirect(userPrompt);
      console.log("InitialMarketAnalysis: Google Direct API succeeded");
    } catch (googleError) {
      console.warn("InitialMarketAnalysis: Google API failed, switching to Lovable AI...", googleError);
      usedFallback = true;
      content = await callLovableAI(userPrompt);
      console.log("InitialMarketAnalysis: Lovable AI fallback succeeded");
    }

    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse JSON from response
    let analysis;
    try {
      // Try to extract JSON from the response
      let jsonStr = content;
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Raw content:", content);
      throw new Error("Failed to parse analysis result");
    }

    // Add timestamp
    analysis.generatedAt = new Date().toISOString();

    // Save to project prd_data
    const existingPrdData = (project.prd_data as Record<string, unknown>) || {};
    const updatedPrdData = {
      ...existingPrdData,
      initialMarketAnalysis: analysis,
    };

    await supabase
      .from("projects")
      .update({ prd_data: updatedPrdData })
      .eq("id", projectId);

    console.log("InitialMarketAnalysis: Market analysis saved successfully");

    return new Response(
      JSON.stringify({ success: true, analysis, usedFallback }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("InitialMarketAnalysis error:", error);
    
    if (error instanceof Error && error.message.includes("Rate limit")) {
      return new Response(
        JSON.stringify({ success: false, error: "请求过于频繁，请稍后再试" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
