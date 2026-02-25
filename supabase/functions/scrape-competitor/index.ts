import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { productId, url } = await req.json();

    if (!productId || !url) {
      return new Response(
        JSON.stringify({ success: false, error: "productId and url are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user owns the project that contains this product
    const { data: product, error: productError } = await supabase
      .from("competitor_products")
      .select("project_id")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return new Response(
        JSON.stringify({ success: false, error: "Product not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("user_id")
      .eq("id", product.project_id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ success: false, error: "Project not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (project.user_id !== userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: You don't have access to this project" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!FIRECRAWL_API_KEY) {
      console.error("FIRECRAWL_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to scraping
    await supabase
      .from("competitor_products")
      .update({ status: "scraping" })
      .eq("id", productId);

    console.log("Scraping URL:", url);

    // Detect platform and check if it's Amazon
    const isAmazon = url.toLowerCase().includes("amazon");
    const asin = isAmazon ? extractAsin(url) : null;

    // Step 1: Scrape product page
    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html", "links"],
        onlyMainContent: false,
        waitFor: 5000,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error("Firecrawl error:", scrapeData);
      await supabase
        .from("competitor_products")
        .update({ status: "failed" })
        .eq("id", productId);

      return new Response(
        JSON.stringify({ success: false, error: scrapeData.error || "Scraping failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const markdown = scrapeData.data?.markdown || "";
    const html = scrapeData.data?.html || "";
    const metadata = scrapeData.data?.metadata || {};

    // Extract product info
    const productInfo = extractProductInfo(markdown, metadata, url);
    
    // Extract ONLY main product image (first large image)
    const mainImage = extractMainProductImage(markdown, url);
    console.log("Main image extracted:", mainImage ? "yes" : "no");
    
    // Extract review summary from product page
    const reviewSummary = extractReviewSummary(markdown);
    console.log("Review summary extracted:", JSON.stringify(reviewSummary));

    // Step 2: If Amazon, scrape reviews using screenshot + OCR
    let reviews: Array<{ text: string; rating?: number; title?: string }> = [];
    let reviewScreenshotUrl: string | null = null;

    if (isAmazon && asin) {
      console.log("Amazon product detected, ASIN:", asin);
      
      try {
        const reviewsResult = await scrapeAmazonReviewsWithOCR(
          asin, 
          FIRECRAWL_API_KEY, 
          LOVABLE_API_KEY,
          supabase, 
          productId
        );
        reviews = reviewsResult.reviews;
        reviewScreenshotUrl = reviewsResult.screenshotUrl;
        console.log(`Scraped ${reviews.length} reviews via screenshot+OCR`);
      } catch (reviewError) {
        console.error("Error scraping reviews with OCR:", reviewError);
        // Fall back to HTML extraction
        reviews = extractReviewsFromHtml(html);
        console.log(`Fallback: extracted ${reviews.length} reviews from HTML`);
      }
    } else {
      // Non-Amazon: extract reviews from main page
      reviews = extractReviewsFromHtml(html);
    }

    // Update product with scraped data
    const { error: updateError } = await supabase
      .from("competitor_products")
      .update({
        product_title: productInfo.title,
        product_description: productInfo.description,
        price: productInfo.price,
        rating: productInfo.rating,
        review_count: productInfo.reviewCount,
        main_image: mainImage,
        product_images: mainImage ? [mainImage] : [],
        review_summary: reviewSummary,
        review_screenshot_url: reviewScreenshotUrl,
        scraped_data: {
          markdown: markdown.slice(0, 50000),
          extractedAt: new Date().toISOString(),
          asin: asin,
          ocrUsed: true,
        },
        status: "completed",
      })
      .eq("id", productId);

    if (updateError) {
      console.error("Update error:", updateError);
      throw updateError;
    }

    // Save reviews
    if (reviews.length > 0) {
      const reviewsToInsert = reviews.slice(0, 100).map((review) => ({
        competitor_product_id: productId,
        review_text: review.text,
        rating: review.rating,
        sentiment: "neutral",
        is_positive: null,
      }));

      await supabase.from("competitor_reviews").insert(reviewsToInsert);
    }

    console.log(`Scraped product: ${productInfo.title}, ${reviews.length} reviews found`);

    return new Response(
      JSON.stringify({
        success: true,
        productInfo,
        reviewCount: reviews.length,
        hasScreenshot: !!reviewScreenshotUrl,
        hasReviewSummary: !!(reviewSummary.topPositives.length || reviewSummary.topNegatives.length),
        ocrUsed: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Scrape error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Extract ASIN from Amazon URL
function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /\/ASIN\/([A-Z0-9]{10})/i,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

// Extract only the main product image (first large image)
function extractMainProductImage(markdown: string, url: string): string | null {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes("amazon")) {
    const patterns = [
      /https?:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9+%-]+\._AC_SL1500_[^"'\s)]*\.(jpg|png|webp)/gi,
      /https?:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9+%-]+\._SL1500_[^"'\s)]*\.(jpg|png|webp)/gi,
      /https?:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9+%-]+\._AC_SL1200_[^"'\s)]*\.(jpg|png|webp)/gi,
      /https?:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9+%-]+[^"'\s)]*\.(jpg|png|webp)/gi,
    ];
    
    for (const pattern of patterns) {
      const matches = markdown.match(pattern);
      if (matches && matches.length > 0) {
        return matches[0];
      }
    }
  }
  
  const generalPattern = /https?:\/\/[^"'\s]+\.(jpg|jpeg|png|webp)/gi;
  const matches = markdown.match(generalPattern);
  if (matches && matches.length > 0) {
    return matches[0];
  }
  
  return null;
}

// Extract review summary from product page
function extractReviewSummary(markdown: string): {
  overallRating: number | null;
  totalReviews: number | null;
  ratingBreakdown: { stars: number; percentage: number }[];
  topPositives: string[];
  topNegatives: string[];
} {
  const result = {
    overallRating: null as number | null,
    totalReviews: null as number | null,
    ratingBreakdown: [] as { stars: number; percentage: number }[],
    topPositives: [] as string[],
    topNegatives: [] as string[],
  };

  const ratingMatch = markdown.match(/(\d+\.?\d*)\s*out of\s*5\s*stars?/i);
  if (ratingMatch) {
    result.overallRating = parseFloat(ratingMatch[1]);
  }

  const reviewCountMatch = markdown.match(/([\d,]+)\s*(?:global\s+)?(?:ratings?|reviews?|customer\s+reviews?)/i);
  if (reviewCountMatch) {
    result.totalReviews = parseInt(reviewCountMatch[1].replace(/,/g, ""), 10);
  }

  const breakdownPattern = /(\d)\s*star[s]?\s*(\d+)%/gi;
  let breakdownMatch;
  while ((breakdownMatch = breakdownPattern.exec(markdown)) !== null) {
    result.ratingBreakdown.push({
      stars: parseInt(breakdownMatch[1], 10),
      percentage: parseInt(breakdownMatch[2], 10),
    });
  }

  const positivePatterns = [
    /customers\s+(?:like|love|mention|say)[^.]*?(?:quality|durable|value|great|excellent|good|perfect|easy)[^.]*\./gi,
  ];
  
  for (const pattern of positivePatterns) {
    const matches = markdown.match(pattern);
    if (matches) {
      for (const match of matches.slice(0, 3)) {
        const cleaned = match.replace(/^customers\s+(?:like|love|mention|say)\s*/i, "").trim();
        if (cleaned.length > 10 && cleaned.length < 200) {
          result.topPositives.push(cleaned);
        }
      }
    }
  }

  return result;
}

// NEW: Screenshot + OCR approach for Amazon reviews
async function scrapeAmazonReviewsWithOCR(
  asin: string,
  firecrawlApiKey: string,
  lovableApiKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  productId: string
): Promise<{ reviews: Array<{ text: string; rating?: number; title?: string }>; screenshotUrl: string | null }> {
  const reviewUrls = [
    `https://www.amazon.com/product-reviews/${asin}/?sortBy=recent&pageNumber=1`,
    `https://www.amazon.com/product-reviews/${asin}/?sortBy=helpful&pageNumber=1`,
  ];
  
  const allReviews: Array<{ text: string; rating?: number; title?: string }> = [];
  let screenshotUrl: string | null = null;

  for (const reviewUrl of reviewUrls) {
    if (allReviews.length >= 50) break;
    
    console.log("Taking screenshot of reviews page:", reviewUrl);

    try {
      // Step 1: Take screenshot of reviews page
      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: reviewUrl,
          formats: ["screenshot", "markdown"],
          onlyMainContent: false,
          waitFor: 8000,
          actions: [
            { type: "wait", milliseconds: 3000 },
            { type: "scroll", direction: "down", amount: 800 },
            { type: "wait", milliseconds: 2000 },
            { type: "scroll", direction: "down", amount: 800 },
            { type: "wait", milliseconds: 2000 },
          ],
        }),
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        console.error("Screenshot error:", data.error || data);
        continue;
      }

      const screenshotData = data.data?.screenshot;
      const markdown = data.data?.markdown || "";
      
      if (!screenshotData) {
        console.log("No screenshot captured, falling back to markdown extraction");
        const markdownReviews = extractReviewsFromMarkdownAdvanced(markdown);
        allReviews.push(...markdownReviews);
        continue;
      }

      console.log("Screenshot captured, type:", typeof screenshotData);
      console.log("Screenshot data prefix:", String(screenshotData).substring(0, 80));

      // Step 2: Convert screenshot to base64 if it's a URL
      let imageBase64: string;
      
      if (screenshotData.startsWith('http')) {
        // Firecrawl returned a URL, we need to download and convert to base64
        console.log("Screenshot is a URL, downloading...");
        try {
          const imageResponse = await fetch(screenshotData);
          if (!imageResponse.ok) {
            console.error("Failed to download screenshot:", imageResponse.status);
            const markdownReviews = extractReviewsFromMarkdownAdvanced(markdown);
            allReviews.push(...markdownReviews);
            continue;
          }
          
          const imageArrayBuffer = await imageResponse.arrayBuffer();
          const imageBytes = new Uint8Array(imageArrayBuffer);
          
          // Convert to base64
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < imageBytes.length; i += chunkSize) {
            const chunk = imageBytes.slice(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
          }
          imageBase64 = btoa(binary);
          console.log("Image downloaded and converted, base64 length:", imageBase64.length);
        } catch (downloadError) {
          console.error("Error downloading screenshot:", downloadError);
          const markdownReviews = extractReviewsFromMarkdownAdvanced(markdown);
          allReviews.push(...markdownReviews);
          continue;
        }
      } else if (screenshotData.startsWith('data:')) {
        // Already a data URL, extract base64 part
        imageBase64 = screenshotData.split(',')[1] || screenshotData;
      } else {
        // Assume it's raw base64
        imageBase64 = screenshotData;
      }

      // Build the proper data URL for Gemini
      const imageDataUrl = `data:image/png;base64,${imageBase64}`;
      console.log("Sending to Gemini, base64 length:", imageBase64.length);
      
      // Primary: Google Direct API for OCR
      const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
      let ocrContent = "";
      
      const ocrPrompt = `You are an expert OCR specialist. Extract ALL user reviews from this Amazon reviews page screenshot.

Return a JSON array with this exact format (no markdown code blocks, just raw JSON):
[
  { "text": "Full review content", "rating": 5, "title": "Review title if visible" },
  { "text": "Another review", "rating": 4, "title": "Title" }
]

IMPORTANT:
- Extract ONLY actual user reviews, not product descriptions or UI elements
- Include the complete review text, not truncated
- Rating should be 1-5 based on the star icons visible
- If rating or title is not visible, omit that field
- Return an empty array [] if no reviews are visible
- Return ONLY the JSON array, no explanations or markdown`;

      try {
        // Try Google Direct first
        console.log("ScrapeCompetitor OCR: Attempting Google Direct API...");
        const googleResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": GOOGLE_API_KEY!,
            },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [
                  { text: ocrPrompt },
                  { inlineData: { mimeType: "image/png", data: imageBase64 } }
                ]
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
            }),
          }
        );

        if (googleResponse.ok) {
          const googleData = await googleResponse.json();
          ocrContent = googleData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          console.log("ScrapeCompetitor OCR: Google Direct succeeded");
        } else {
          throw new Error(`Google API error: ${googleResponse.status}`);
        }
      } catch (googleError) {
        console.warn("ScrapeCompetitor OCR: Google failed, trying Lovable AI...", googleError);
        
        // Fallback to Lovable AI
        const ocrResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: ocrPrompt },
                { type: "image_url", image_url: { url: imageDataUrl } }
              ]
            }],
            temperature: 0.1,
            max_tokens: 8000,
          }),
        });

        if (!ocrResponse.ok) {
          throw new Error(`Lovable AI OCR error: ${ocrResponse.status}`);
        }

        const ocrData = await ocrResponse.json();
        ocrContent = ocrData.choices?.[0]?.message?.content || "";
        console.log("ScrapeCompetitor OCR: Lovable AI fallback succeeded");
      }
      
      console.log("OCR response received, length:", ocrContent.length);

      // Parse OCR results
      try {
        let jsonStr = ocrContent;
        const jsonMatch = ocrContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }
        
        const extractedReviews = JSON.parse(jsonStr);
        
        if (Array.isArray(extractedReviews)) {
          console.log(`OCR extracted ${extractedReviews.length} reviews`);
          
          for (const review of extractedReviews) {
            if (review.text && review.text.length >= 20) {
              // Check for duplicates
              const isDuplicate = allReviews.some(r => 
                r.text.substring(0, 50) === review.text.substring(0, 50)
              );
              if (!isDuplicate) {
                allReviews.push({
                  text: review.text,
                  rating: review.rating,
                  title: review.title,
                });
              }
            }
          }
        }
      } catch (parseError) {
        console.error("Failed to parse OCR response:", parseError);
        console.log("OCR content:", ocrContent.substring(0, 500));
        
        // Fallback to markdown extraction
        const markdownReviews = extractReviewsFromMarkdownAdvanced(markdown);
        allReviews.push(...markdownReviews);
      }

      // Save first screenshot URL (upload to storage if needed)
      if (!screenshotUrl && imageBase64) {
        try {
          const filename = `review-screenshot-${productId}-${Date.now()}.png`;
          const binaryData = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("review-screenshots")
            .upload(filename, binaryData, {
              contentType: "image/png",
            });

          if (!uploadError && uploadData) {
            const { data: urlData } = supabase.storage
              .from("review-screenshots")
              .getPublicUrl(filename);
            screenshotUrl = urlData?.publicUrl || null;
            console.log("Screenshot uploaded:", screenshotUrl);
          }
        } catch (uploadErr) {
          console.error("Screenshot upload failed:", uploadErr);
        }
      }

      console.log(`Total reviews so far: ${allReviews.length}`);
    } catch (error) {
      console.error("Error in screenshot+OCR flow:", error);
    }
  }

  return { reviews: allReviews, screenshotUrl };
}

// Extract reviews from HTML (fallback)
function extractReviewsFromHtml(html: string): Array<{ text: string; rating?: number }> {
  const reviews: Array<{ text: string; rating?: number }> = [];
  
  if (!html || html.length < 100) return reviews;

  const reviewBodyPattern = /<span[^>]*data-hook="review-body"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = reviewBodyPattern.exec(html)) !== null) {
    const content = cleanHtmlText(match[1]);
    if (isValidReviewContent(content)) {
      const rating = findNearbyRating(html, match.index);
      reviews.push({ text: content, rating });
    }
  }

  const reviewDivPattern = /<div[^>]*class="[^"]*review-text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  while ((match = reviewDivPattern.exec(html)) !== null) {
    const content = cleanHtmlText(match[1]);
    if (isValidReviewContent(content) && !reviews.some(r => r.text.includes(content.substring(0, 50)))) {
      const rating = findNearbyRating(html, match.index);
      reviews.push({ text: content, rating });
    }
  }

  console.log(`HTML extraction found ${reviews.length} reviews`);
  return reviews.slice(0, 100);
}

function cleanHtmlText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function findNearbyRating(html: string, position: number): number | undefined {
  const searchStart = Math.max(0, position - 500);
  const searchText = html.substring(searchStart, position);
  
  const patterns = [
    /(\d)\.0 out of 5 stars/gi,
    /(\d) out of 5 stars/gi,
    /a-star-(\d)/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = [...searchText.matchAll(pattern)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      return parseInt(lastMatch[1], 10);
    }
  }
  
  return undefined;
}

function isValidReviewContent(text: string): boolean {
  if (!text || text.length < 50 || text.length > 3000) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (text.includes("amazon.com")) return false;
  
  const uiPatterns = [
    /^(see|read|show)\s+(more|all|full)/i,
    /^(helpful|report|share)/i,
    /^\d+\s*(people|person)\s+found/i,
    /^verified purchase$/i,
    /^reviewed in/i,
    /add to cart/i,
    /buy now/i,
    /in stock/i,
    /free shipping/i,
    /sold by/i,
    /sponsored/i,
    /advertisement/i,
  ];
  
  if (uiPatterns.some(p => p.test(text))) return false;
  
  const wordCount = text.split(/\s+/).filter(w => w.length >= 3).length;
  if (wordCount < 5) return false;
  
  if (!/[a-zA-Z]{5,}/.test(text)) return false;
  
  return true;
}

function extractReviewsFromMarkdownAdvanced(markdown: string): Array<{ text: string; rating?: number }> {
  const reviews: Array<{ text: string; rating?: number }> = [];
  
  if (!markdown || markdown.length < 100) return reviews;

  const sections = markdown.split(/(?=\d\.0 out of 5 stars)/gi);
  
  for (const section of sections) {
    if (section.length < 100) continue;
    
    const ratingMatch = section.match(/^(\d)\.0 out of 5 stars/i);
    const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : undefined;
    
    const lines = section.split(/\n+/);
    let reviewText = '';
    let foundVerified = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 20) continue;
      
      if (/verified purchase/i.test(trimmed)) {
        foundVerified = true;
        continue;
      }
      
      if (isUiLine(trimmed)) continue;
      
      if (foundVerified && trimmed.length >= 30) {
        if (/^\d+ people found this helpful/i.test(trimmed)) break;
        if (/^(helpful|report)$/i.test(trimmed)) break;
        
        reviewText += ' ' + trimmed;
      }
    }
    
    reviewText = reviewText.trim();
    if (reviewText.length >= 50 && isValidReviewContent(reviewText)) {
      reviews.push({ text: reviewText, rating });
    }
  }
  
  return reviews;
}

function isUiLine(line: string): boolean {
  const patterns = [
    /^(see|read|show)\s+(more|all|full)/i,
    /^(helpful|report|share)/i,
    /^\d+\s*(people|person)\s+found/i,
    /^verified purchase$/i,
    /^reviewed in/i,
    /^\d+\s*out of\s*\d+/i,
    /^\[.*\]$/,
    /^!\[/,
    /amazon\.com/i,
    /^https?:/i,
    /^add to/i,
    /^buy now/i,
    /^in stock/i,
    /^color:/i,
    /^size:/i,
    /^style:/i,
    /^\d+\s*star/i,
    /customer reviews?$/i,
  ];
  
  return patterns.some(p => p.test(line.trim()));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractProductInfo(markdown: string, metadata: any, url: string) {
  let title = metadata.title || "";
  const description = metadata.description || "";
  let price = "";
  let rating = null;
  let reviewCount = null;

  const pricePatterns = [
    /\$[\d,]+\.?\d*/g,
    /￥[\d,]+\.?\d*/g,
    /US\s*\$[\d,]+\.?\d*/gi,
  ];

  for (const pattern of pricePatterns) {
    const matches = markdown.match(pattern);
    if (matches && matches.length > 0) {
      price = matches[0].trim();
      break;
    }
  }

  const ratingPatterns = [
    /(\d+\.?\d*)\s*out of\s*5/i,
    /Rating:\s*(\d+\.?\d*)/i,
  ];

  for (const pattern of ratingPatterns) {
    const match = markdown.match(pattern);
    if (match && match[1]) {
      const parsed = parseFloat(match[1]);
      if (parsed >= 0 && parsed <= 5) {
        rating = parsed;
        break;
      }
    }
  }

  const reviewPatterns = [
    /([\d,]+)\s*(?:global\s+)?(?:ratings?|reviews?)/i,
    /(\d+)\s*customer\s*reviews?/i,
  ];

  for (const pattern of reviewPatterns) {
    const match = markdown.match(pattern);
    if (match && match[1]) {
      reviewCount = parseInt(match[1].replace(/,/g, ""), 10);
      break;
    }
  }

  if (title) {
    title = title
      .replace(/\s*[-|:]\s*(Amazon|AliExpress|eBay).*$/i, "")
      .trim();
  }

  return { title, description, price, rating, reviewCount };
}
