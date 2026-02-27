import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  GoogleGenAI,
  Modality,
} from "https://esm.sh/@google/genai@0.14.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PrdData {
  usageScenario?: string;
  usageScenarios?: string[];
  targetAudience?: string;
  coreFeatures?: string[];
  designStyle?: string;
  selectedDirection?: string;
  designStyleDetails?: {
    overallStyle?: string;
    colorTone?: string;
    surfaceTexture?: string;
    shapeLanguage?: string;
    inspirationKeywords?: string[];
    materialPreference?: string[];
    avoidElements?: string[];
  };
}

// Build context from PRD data
function buildPrdContext(prdData?: PrdData): string {
  if (!prdData) return "";
  
  const parts: string[] = [];
  
  if (prdData.selectedDirection) {
    parts.push(`产品方向：${prdData.selectedDirection}`);
  }
  if (prdData.targetAudience) {
    parts.push(`目标用户：${prdData.targetAudience}`);
  }
  if (prdData.usageScenario) {
    parts.push(`使用场景：${prdData.usageScenario}`);
  }
  if (prdData.usageScenarios?.length) {
    parts.push(`使用场景：${prdData.usageScenarios.join("、")}`);
  }
  if (prdData.coreFeatures?.length) {
    parts.push(`核心功能：${prdData.coreFeatures.join("、")}`);
  }
  if (prdData.designStyle) {
    parts.push(`设计风格：${prdData.designStyle}`);
  }
  
  // Enhanced design style details
  if (prdData.designStyleDetails) {
    const details = prdData.designStyleDetails;
    if (details.overallStyle) {
      parts.push(`整体风格：${details.overallStyle}`);
    }
    if (details.colorTone) {
      parts.push(`色彩基调：${details.colorTone}`);
    }
    if (details.surfaceTexture) {
      parts.push(`表面质感：${details.surfaceTexture}`);
    }
    if (details.shapeLanguage) {
      parts.push(`造型语言：${details.shapeLanguage}`);
    }
    if (details.materialPreference?.length) {
      parts.push(`材质偏好：${details.materialPreference.join("、")}`);
    }
    if (details.inspirationKeywords?.length) {
      parts.push(`设计灵感：${details.inspirationKeywords.join("、")}`);
    }
    if (details.avoidElements?.length) {
      parts.push(`避免元素：${details.avoidElements.join("、")}`);
    }
  }
  
  return parts.length > 0 ? `\n\n产品定义：\n${parts.join("\n")}` : "";
}

// Generate marketing copy based on image type and PRD data
async function generateMarketingCopy(
  imageType: string, 
  prdData: PrdData | undefined,
  ai: GoogleGenAI
): Promise<string | null> {
  try {
    const imageTypeLabels: Record<string, string> = {
      scene: "场景图",
      structure: "结构图",
      exploded: "爆炸图",
      usage: "使用图",
      lifestyle: "生活方式图",
      detail: "细节图",
      comparison: "对比图",
    };

    const typeLabel = imageTypeLabels[imageType] || "营销图";
    const prdContext = buildPrdContext(prdData);
    
    const prompt = `为一张产品${typeLabel}生成简短的营销文案（1-2句话，不超过50字）。文案要吸引人、突出产品价值。${prdContext}

要求：
- 简洁有力，易于理解
- 突出产品的独特卖点
- 适合社交媒体或电商平台使用
- 不要使用引号包裹

只输出文案内容，不要任何其他解释。`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const copy = response.text?.trim();
    return copy || null;
  } catch (error) {
    console.error("Error generating marketing copy:", error);
    return null;
  }
}

// Prompt engineering templates for different image types
function buildPromptForImageType(
  basePrompt: string, 
  imageType: string, 
  phase: number,
  prdData?: PrdData
): string {
  const prdContext = buildPrdContext(prdData);
  
  const commonQuality = `
RENDER QUALITY:
- 8K ultra high resolution render
- Photorealistic CGI quality matching real photography
- Ray-traced global illumination
- Accurate material representation with realistic textures
- Color-accurate rendering for e-commerce standards`;

  if (phase === 1 || imageType === "product") {
    // Phase 1: Product design - pure white background
    return `Create a professional e-commerce product photograph:

PRODUCT: ${basePrompt}${prdContext}

PHOTOGRAPHY SPECIFICATIONS:
- Three-point lighting setup with key light, fill light, and rim light
- Soft diffused studio lighting with subtle gradient shadows
- Professional product photography lighting with highlight control

BACKGROUND: Seamless pure white cyclorama background (RGB 255,255,255); Infinite white studio backdrop with subtle reflection plane

CAMERA SETTINGS: Shot with Phase One IQ4 150MP medium format camera; 100mm macro lens at f/11 for maximum sharpness; Focus stacked for edge-to-edge clarity
${commonQuality}

COMPOSITION: Hero product angle with 3/4 perspective view; Centered composition with balanced negative space; Product floating slightly with soft contact shadow

OUTPUT: A single, clean, commercially-ready product image suitable for Amazon, Shopify, or premium e-commerce listings. The product should be the sole focus with no distracting elements, props, or text. Maintain accurate proportions and showcase the product's key design features and material quality.`;
  }

  // Phase 2: Marketing images based on type - with product consistency emphasis
  const productConsistencyNote = `
【关键约束 - 产品造型一致性】
- 产品的外观、颜色、形状、尺寸、比例必须与原产品图100%一致
- 不得改变产品的任何设计细节（按钮位置、线条、材质纹理等）
- 不得添加或移除产品的任何部件
- 产品的品牌标识、logo位置必须保持原样
- 产品材质的反光、高光特性需保持一致`;

  switch (imageType) {
    case "scene":
      return `Create a lifestyle product scene photograph:

PRODUCT: ${basePrompt}${prdContext}
${productConsistencyNote}

SCENE REQUIREMENTS:
- Product naturally placed in an authentic, lifestyle environment
- Soft, natural lighting (golden hour or diffused daylight)
- Subtle depth of field with product in sharp focus
- Environment complements but doesn't distract from the product
- Warm, inviting atmosphere

MOOD: Aspirational lifestyle, premium quality, authentic usage context
${commonQuality}

OUTPUT: A beautiful lifestyle photograph showing the product in its natural usage environment. The scene should tell a story and evoke desire for the product. THE PRODUCT APPEARANCE MUST REMAIN EXACTLY AS SHOWN IN THE REFERENCE.`;

    case "structure":
      return `Create a technical structure visualization:

PRODUCT: ${basePrompt}${prdContext}
${productConsistencyNote}

VISUALIZATION REQUIREMENTS:
- Semi-transparent outer shell revealing internal structure
- Clean, technical illustration style
- Component labels and callouts where appropriate
- Blue-tinted technical color scheme
- Precise engineering accuracy

STYLE: Technical illustration, cutaway view, component breakdown
${commonQuality}

OUTPUT: A clear technical diagram showing the internal structure and key components of the product. Professional engineering visualization quality. THE PRODUCT SHAPE AND PROPORTIONS MUST MATCH THE REFERENCE EXACTLY.`;

    case "exploded":
      return `Create an exploded view diagram:

PRODUCT: ${basePrompt}${prdContext}
${productConsistencyNote}

EXPLODED VIEW REQUIREMENTS:
- All components separated and arranged along central axis
- Clear spatial hierarchy showing assembly order
- Each part distinctly visible and identifiable
- Connecting lines or paths showing assembly relationships
- Clean white or light gradient background

STYLE: Technical exploded view, isometric perspective, assembly diagram
${commonQuality}

OUTPUT: A professional exploded view showing all product components in their relative positions with clear visual separation. EACH COMPONENT MUST MATCH THE DESIGN OF THE REFERENCE PRODUCT.`;

    case "usage":
      return `Create a product usage photograph:

PRODUCT: ${basePrompt}${prdContext}
${productConsistencyNote}

USAGE SCENE REQUIREMENTS:
- Show a person naturally interacting with/using the product
- Natural, authentic body language and expressions
- Focus on the interaction point between user and product
- Warm, inviting lighting
- Lifestyle context that resonates with target audience

MOOD: Natural, authentic, relatable, aspirational
${commonQuality}

OUTPUT: An authentic photograph of someone using the product in a natural way. The image should help potential customers visualize themselves using the product. THE PRODUCT IN THE SCENE MUST BE IDENTICAL TO THE REFERENCE IMAGE.`;

    case "lifestyle":
      return `Create a brand lifestyle photograph:

PRODUCT: ${basePrompt}${prdContext}
${productConsistencyNote}

LIFESTYLE REQUIREMENTS:
- Product integrated into a curated lifestyle setting
- Premium, aspirational aesthetic
- Cohesive color palette and styling
- Story-telling composition
- Editorial-quality photography style

MOOD: Premium, aspirational, brand-aligned, magazine-quality
${commonQuality}

OUTPUT: A beautiful lifestyle photograph that positions the product within an aspirational lifestyle context. Think premium magazine editorial quality. THE PRODUCT MUST LOOK EXACTLY AS IT DOES IN THE REFERENCE IMAGE.`;

    case "detail":
      return `Create a product detail macro photograph:

PRODUCT: ${basePrompt}${prdContext}
${productConsistencyNote}

DETAIL REQUIREMENTS:
- Extreme close-up of key product feature or texture
- Shallow depth of field highlighting specific detail
- Professional macro photography lighting
- Showcase material quality and craftsmanship
- Sharp focus on the detail area

STYLE: Macro photography, texture detail, craftsmanship showcase
${commonQuality}

OUTPUT: A stunning close-up photograph that highlights the quality, texture, and craftsmanship of a specific product detail. THE DETAIL MUST BE FROM THE SAME PRODUCT AS SHOWN IN THE REFERENCE.`;

    case "comparison":
      return `Create a before/after or comparison image:

PRODUCT: ${basePrompt}${prdContext}
${productConsistencyNote}

COMPARISON REQUIREMENTS:
- Split or side-by-side comparison layout
- Clear visual distinction between scenarios
- Highlight the improvement or benefit
- Consistent lighting and perspective in both halves
- Clean, professional presentation

STYLE: Comparison, before/after, problem-solution
${commonQuality}

OUTPUT: A clear comparison image showing the problem being solved or improvement being made, effectively communicating the product's value proposition. THE PRODUCT SHOWN MUST MATCH THE REFERENCE EXACTLY.`;

    default:
      // Custom or fallback
      return `Create a professional marketing photograph:

PRODUCT: ${basePrompt}${prdContext}
${productConsistencyNote}
${commonQuality}

OUTPUT: A high-quality marketing photograph suitable for advertising and promotional use. THE PRODUCT MUST REMAIN VISUALLY IDENTICAL TO THE REFERENCE IMAGE.`;
  }
}

// Fetch image and convert to base64
async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  // Check if already a data URL (base64)
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], base64: match[2] };
    }
    throw new Error("Invalid data URL format");
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  
  const contentType = response.headers.get("content-type") || "image/png";
  const arrayBuffer = await response.arrayBuffer();
  
  // Use chunked encoding to avoid stack overflow with large arrays
  const uint8Array = new Uint8Array(arrayBuffer);
  let base64 = "";
  const chunkSize = 0x8000; // 32KB chunks
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    base64 += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  base64 = btoa(base64);
  
  return { base64, mimeType: contentType };
}

// Generate image via Lovable AI Gateway - Fallback using same Nano banana pro model
async function generateImageViaGatewayFallback(
  prompt: string,
  parentImageUrl?: string
): Promise<{ imageUrl: string; description?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const content: any[] = [{ type: "text", text: prompt }];
  
  if (parentImageUrl) {
    let imageData = parentImageUrl;
    if (!parentImageUrl.startsWith("data:")) {
      const { base64, mimeType } = await fetchImageAsBase64(parentImageUrl);
      imageData = `data:${mimeType};base64,${base64}`;
    }
    content.push({
      type: "image_url",
      image_url: { url: imageData }
    });
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image-preview",
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gateway fallback error:", response.status, errorText);
    throw new Error(`Gateway fallback failed: ${response.status}`);
  }

  const data = await response.json();
  const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const description = data.choices?.[0]?.message?.content;
  
  if (!imageData) {
    throw new Error("No image in gateway fallback response");
  }

  return { imageUrl: imageData, description };
}

// Generate image via Lovable AI Gateway - Uses Nano banana pro (google/gemini-3-pro-image-preview)
// This is now the PRIMARY method for higher quality image generation
async function generateImageViaLovable(
  prompt: string,
  parentImageUrl?: string
): Promise<{ imageUrl: string; description?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const content: any[] = [{ type: "text", text: prompt }];
  
  if (parentImageUrl) {
    // Add reference image for editing
    let imageData = parentImageUrl;
    if (!parentImageUrl.startsWith("data:")) {
      const { base64, mimeType } = await fetchImageAsBase64(parentImageUrl);
      imageData = `data:${mimeType};base64,${base64}`;
    }
    content.push({
      type: "image_url",
      image_url: { url: imageData }
    });
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image-preview",  // Nano banana pro - highest quality image model
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Lovable AI error:", response.status, errorText);
    throw new Error(`Lovable AI failed: ${response.status}`);
  }

  const data = await response.json();
  const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const description = data.choices?.[0]?.message?.content;
  
  if (!imageData) {
    throw new Error("No image in Lovable AI response");
  }

  return { imageUrl: imageData, description };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      prompt, 
      projectId, 
      imageType = "product", 
      phase = 1,
      parentImageId,
      parentImageUrl,
      prdData,
      referenceImageUrls
    } = await req.json();
    
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");

    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is not configured");
    }

    if (!prompt) {
      throw new Error("Prompt is required");
    }

    // Initialize Google GenAI
    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

    // Build prompt based on image type, phase, and PRD data
    let enhancedPrompt = buildPromptForImageType(prompt, imageType, phase, prdData);
    
    // Add reference image context if available
    if (referenceImageUrls && referenceImageUrls.length > 0) {
      enhancedPrompt += `\n\n【用户参考图片】用户提供了 ${referenceImageUrls.length} 张参考图片作为设计灵感。请参考这些图片的风格、配色、造型语言来生成产品设计。`;
    }

    // Determine if we should use image editing mode (phase 2 with parent image)
    const useImageEditing = phase === 2 && parentImageUrl && imageType !== "product";
    
    let imageResult: { imageUrl: string; description?: string };
    let usedFallback = false;

    // Primary: Lovable AI Gateway with Nano banana 2 (google/gemini-3-pro-image-preview)
    try {
      console.log("GenerateImage: Attempting Lovable AI (Nano banana 2 / gemini-3-pro-image-preview)...");
      imageResult = await generateImageViaLovable(
        enhancedPrompt,
        useImageEditing ? parentImageUrl : undefined
      );
      console.log("GenerateImage: Lovable AI succeeded");
    } catch (lovableError) {
      console.warn("GenerateImage: Lovable AI failed, trying gateway fallback...", lovableError);
      usedFallback = true;
      
      // Fallback: Gateway with same model
      imageResult = await generateImageViaGatewayFallback(
        enhancedPrompt,
        useImageEditing ? parentImageUrl : undefined
      );
      console.log("GenerateImage: Gateway fallback succeeded");
    }

    // Generate marketing copy for phase 2 images
    let marketingCopy: string | null = null;
    if (phase === 2 && imageType !== "product") {
      marketingCopy = await generateMarketingCopy(imageType, prdData, ai);
    }

    return new Response(
      JSON.stringify({
        imageUrl: imageResult.imageUrl,
        description: imageResult.description,
        prompt: enhancedPrompt,
        imageType,
        phase,
        marketingCopy,
        usedFallback,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Generate image error:", error);
    
    // Handle rate limiting
    if (error instanceof Error && error.message.includes("429")) {
      return new Response(JSON.stringify({ error: "请求过于频繁，请稍后再试" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
