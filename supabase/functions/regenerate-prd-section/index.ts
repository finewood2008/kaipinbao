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

const sectionPrompts: Record<string, string> = {
  productOverview: `Based on the product context provided, generate a product overview including:
- productName: A catchy product name (both Chinese and English)
- productTagline: A memorable tagline (both Chinese and English)
- productCategory: Product category
- pricingRange: Recommended price range
Output as JSON object in Chinese.`,

  usageScenario: `Based on the product context provided, generate a detailed description of usage scenarios for this product. 
Include 3-5 specific scenarios where the product would be used, mentioning:
- Environment (indoor/outdoor, specific locations)
- Context (work, leisure, travel, etc.)
- User state (alone, with others, on the go, etc.)
Output in Chinese. Be specific and vivid.`,

  targetAudience: `Based on the product context provided, generate a detailed target audience description. Include:
- Age range and demographics
- Occupation or lifestyle
- Key pain points they experience
- What they value most in such products
- Purchasing behavior characteristics
Output in Chinese. Be specific and create a vivid persona.`,

  designStyle: `Based on the product context provided, generate a detailed CMF (Color, Material, Finish) design specification. Include:
- designStyle: Overall design direction and aesthetic
- cmfDesign: {
    "primaryColor": Primary color with description,
    "secondaryColor": Secondary color,
    "accentColor": Accent color,
    "surfaceFinish": Surface treatment,
    "textureDetails": Texture description,
    "materialBreakdown": [{"material": "name", "percentage": number, "location": "where used"}]
  }
Output as JSON object in Chinese.`,

  coreFeatures: `Based on the product context provided, generate a list of 4-6 core features. Each feature should:
- Address a specific user pain point
- Differentiate from competitors
- Be technically feasible
- Have clear user benefit
Output as a JSON array of strings in Chinese. Example: ["功能1", "功能2"]`,

  specifications: `Based on the product context provided, generate product specifications. Include:
- dimensions: Size in mm
- weight: Weight in grams
- materials: Array of materials used
- colors: Available color options
- powerSource: Power type if applicable
- connectivity: Connection types if applicable
Output as JSON object in Chinese.`,

  marketPositioning: `Based on the product context provided, generate market positioning strategy. Include:
- priceTier: "budget" | "mid-range" | "premium" | "luxury"
- primaryCompetitors: Array of main competitor names
- uniqueSellingPoints: Array of 3 key USPs
- competitiveAdvantages: Array of advantages vs competitors
- targetMarketSize: Estimated market size description
Output as JSON object in Chinese.`,

  packaging: `Based on the product context provided, generate packaging design specifications. Include:
- packageType: Type of packaging
- includedAccessories: Array of items in box
- specialPackagingFeatures: Unboxing experience design
- sustainabilityFeatures: Eco-friendly aspects
Output as JSON object in Chinese.`,

  marketingAssets: `Based on the product context provided, generate marketing asset descriptions. Include:
- sceneDescription: A detailed scene for product photography (lighting, background, props)
- usageScenarios: 3 specific usage scenario descriptions for photos
- lifestyleContext: The lifestyle message to convey
Output as JSON object in Chinese.`,

  videoAssets: `Based on the product context provided, generate video creative descriptions for a 6-second product video. Include:
- storyLine: A brief story arc (beginning, middle, end)
- keyActions: 2-3 key actions to show in the video
- emotionalTone: The emotional message to convey
Output as JSON object in Chinese.`,
};

// Call Google Gemini API directly (Primary)
async function callGoogleDirect(prompt: string): Promise<string> {
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
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Google API error:", error);
    throw new Error(`Google API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// Call Lovable AI Gateway (Fallback)
async function callLovableAI(prompt: string): Promise<string> {
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
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Lovable AI error:", error);
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
        JSON.stringify({ error: "Unauthorized" }),
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
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { projectId, section, currentPrdData } = await req.json();

    if (!projectId || !section) {
      return new Response(
        JSON.stringify({ error: "projectId and section are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify project ownership
    const ownershipCheck = await verifyProjectOwnership(supabase, projectId, userId);
    if (ownershipCheck.error) {
      return new Response(
        JSON.stringify({ error: ownershipCheck.error }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get project info
    const { data: project } = await supabase
      .from("projects")
      .select("name, description")
      .eq("id", projectId)
      .single();

    // Get competitor insights
    const { data: competitors } = await supabase
      .from("competitor_products")
      .select("product_title, price, rating, review_count")
      .eq("project_id", projectId)
      .eq("status", "completed");

    // Build context
    let context = `产品项目: ${project?.name || "未命名"}
${project?.description ? `产品描述: ${project.description}` : ""}

当前PRD数据:
${currentPrdData?.productName ? `- 产品名称: ${currentPrdData.productName}` : ""}
${currentPrdData?.usageScenario ? `- 使用场景: ${currentPrdData.usageScenario}` : ""}
${currentPrdData?.targetAudience ? `- 目标用户: ${currentPrdData.targetAudience}` : ""}
${currentPrdData?.designStyle ? `- 外观风格: ${currentPrdData.designStyle}` : ""}
${currentPrdData?.coreFeatures?.length ? `- 核心功能: ${currentPrdData.coreFeatures.join(", ")}` : ""}
${currentPrdData?.pricingRange ? `- 定价区间: ${currentPrdData.pricingRange}` : ""}
`;

    if (competitors && competitors.length > 0) {
      context += `\n竞品分析:
${competitors.map((c: { product_title: string; price: string | null; rating: number | null }) => `- ${c.product_title} (${c.price || "价格未知"}, ${c.rating || 0}★)`).join("\n")}`;
    }

    const sectionPrompt = sectionPrompts[section];
    if (!sectionPrompt) {
      return new Response(
        JSON.stringify({ error: `Unknown section: ${section}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullPrompt = `${context}\n\n${sectionPrompt}`;

    console.log("RegeneratePrdSection: Attempting Google Direct API...");

    // Primary: Google Direct API
    let generatedText: string;
    let usedFallback = false;

    try {
      generatedText = await callGoogleDirect(fullPrompt);
      console.log("RegeneratePrdSection: Google Direct API succeeded");
    } catch (googleError) {
      console.warn("RegeneratePrdSection: Google API failed, switching to Lovable AI...", googleError);
      usedFallback = true;
      generatedText = await callLovableAI(fullPrompt);
      console.log("RegeneratePrdSection: Lovable AI fallback succeeded");
    }

    // Parse the generated content based on section type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let regeneratedContent: any;

    if (section === "coreFeatures") {
      // Extract JSON array from response
      const jsonMatch = generatedText.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        try {
          regeneratedContent = JSON.parse(jsonMatch[0]);
        } catch {
          // If JSON parsing fails, split by newlines
          regeneratedContent = generatedText
            .split("\n")
            .filter((line: string) => line.trim().startsWith("-") || line.trim().startsWith("•"))
            .map((line: string) => line.replace(/^[-•]\s*/, "").trim());
        }
      } else {
        regeneratedContent = generatedText
          .split("\n")
          .filter((line: string) => line.trim().length > 0 && !line.startsWith("#"))
          .slice(0, 6);
      }
    } else if (["marketingAssets", "videoAssets", "specifications", "marketPositioning", "packaging", "designStyle", "productOverview"].includes(section)) {
      // Extract JSON object from response
      let jsonStr = generatedText;
      const codeBlockMatch = generatedText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          regeneratedContent = JSON.parse(jsonMatch[0]);
        } catch {
          regeneratedContent = { raw: generatedText };
        }
      } else {
        regeneratedContent = { raw: generatedText };
      }
    } else {
      // For text sections, clean up the response
      regeneratedContent = generatedText
        .replace(/^#+\s*/gm, "")
        .replace(/\*\*/g, "")
        .trim();
    }

    // Update the project with new content
    const updatedPrdData = { ...currentPrdData };
    
    if (section === "coreFeatures") {
      updatedPrdData.coreFeatures = regeneratedContent;
    } else if (section === "marketingAssets") {
      updatedPrdData.marketingAssets = regeneratedContent;
    } else if (section === "videoAssets") {
      updatedPrdData.videoAssets = regeneratedContent;
    } else if (section === "specifications") {
      updatedPrdData.specifications = regeneratedContent;
    } else if (section === "marketPositioning") {
      updatedPrdData.marketPositioning = regeneratedContent;
    } else if (section === "packaging") {
      updatedPrdData.packaging = regeneratedContent;
    } else if (section === "designStyle") {
      updatedPrdData.designStyle = regeneratedContent.designStyle;
      updatedPrdData.cmfDesign = regeneratedContent.cmfDesign;
    } else if (section === "productOverview") {
      updatedPrdData.productName = regeneratedContent.productName;
      updatedPrdData.productTagline = regeneratedContent.productTagline;
      updatedPrdData.productCategory = regeneratedContent.productCategory;
      updatedPrdData.pricingRange = regeneratedContent.pricingRange;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (updatedPrdData as any)[section] = regeneratedContent;
    }

    await supabase
      .from("projects")
      .update({ prd_data: updatedPrdData })
      .eq("id", projectId);

    return new Response(
      JSON.stringify({ success: true, regeneratedContent, usedFallback }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Regenerate error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
