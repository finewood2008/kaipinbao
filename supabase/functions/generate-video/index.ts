import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { GoogleGenAI } from "https://esm.sh/@google/genai@0.14.1";

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

interface PrdData {
  usageScenario?: string;
  usageScenarios?: string[];
  targetAudience?: string;
  coreFeatures?: string[];
  designStyle?: string;
  selectedDirection?: string;
}

// Fetch image and convert to base64
async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  console.log("Fetching image from:", imageUrl);
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  
  const contentType = response.headers.get("content-type") || "image/png";
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Convert to base64 in chunks to avoid stack overflow for large images
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const base64 = btoa(binary);
  
  console.log("Image fetched successfully, mimeType:", contentType, "base64 length:", base64.length);
  return { base64, mimeType: contentType };
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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    
    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is not configured");
    }

    // Create client with user's auth token for verification
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user token and get user
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    const { 
      projectId, 
      sceneDescription, 
      parentImageId, 
      parentImageUrl, 
      duration = 6,
      prdData 
    } = await req.json();

    console.log("Generate video request:", { projectId, sceneDescription, parentImageId, hasParentImageUrl: !!parentImageUrl, duration });

    if (!projectId || !sceneDescription) {
      throw new Error("Project ID and scene description are required");
    }

    // Create Supabase client with service role for database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify project ownership
    const ownershipCheck = await verifyProjectOwnership(supabase, projectId, userId);
    if (ownershipCheck.error) {
      return new Response(
        JSON.stringify({ error: ownershipCheck.error }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build enhanced video prompt with PRD context
    const videoPrompt = buildVideoPrompt(sceneDescription, prdData);
    console.log("Video prompt built:", videoPrompt.substring(0, 200) + "...");

    // Create video record with pending status
    const { data: videoRecord, error: insertError } = await supabase
      .from("generated_videos")
      .insert({
        project_id: projectId,
        prompt: videoPrompt,
        scene_description: sceneDescription,
        duration_seconds: duration,
        status: "processing",
        parent_image_id: parentImageId || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create video record:", insertError);
      throw new Error("Failed to create video record");
    }

    console.log("Video record created:", videoRecord.id);

    // Initialize Google GenAI
    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

    // Attempt to generate video using Google Veo
    try {
      let operation;
      
      if (parentImageUrl) {
        // Image-to-video generation - maintain product consistency
        console.log("Using image-to-video mode with parent image");
        
        const { base64, mimeType } = await fetchImageAsBase64(parentImageUrl);
        
        const imageToVideoPrompt = `Generate a 6-second professional product showcase video based on this product image.

${videoPrompt}

CRITICAL REQUIREMENTS:
- The product appearance MUST match the image exactly (shape, color, texture, design details)
- Only add subtle camera movements and lighting changes
- Keep the product as the focal point throughout
- Create smooth, professional cinematic motion`;

        console.log("Calling Google Veo API with image...");
        
        operation = await ai.models.generateVideos({
          model: "veo-2.0-generate-001",
          prompt: imageToVideoPrompt,
          image: {
            imageBytes: base64,
            mimeType: mimeType,
          },
          config: {
            personGeneration: "dont_allow",
            aspectRatio: "16:9",
            numberOfVideos: 1,
          },
        });
      } else {
        // Text-to-video generation
        console.log("Using text-to-video mode");
        
        operation = await ai.models.generateVideos({
          model: "veo-2.0-generate-001",
          prompt: videoPrompt,
          config: {
            personGeneration: "dont_allow",
            aspectRatio: "16:9",
            numberOfVideos: 1,
          },
        });
      }

      console.log("Initial operation response received, starting polling...");

      // Poll for video generation completion
      let attempts = 0;
      const maxAttempts = 60; // Max 5 minutes (5s interval)
      
      while (!operation.done && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({
          operation: operation,
        });
        attempts++;
        console.log(`Video generation polling attempt ${attempts}/${maxAttempts}, done: ${operation.done}`);
      }

      console.log("Polling completed. Operation done:", operation.done);

      if (operation.done && operation.response?.generatedVideos?.[0]) {
        const video = operation.response.generatedVideos[0];
        const videoUrl = video.video?.uri;

        console.log("Generated video URI:", videoUrl);

        if (videoUrl) {
          // Download video from Google and upload to Supabase Storage to avoid exposing API key
          const videoFetchUrl = videoUrl.includes("key=")
            ? videoUrl
            : `${videoUrl}${videoUrl.includes("?") ? "&" : "?"}key=${GOOGLE_API_KEY}`;

          let storageUrl: string | null = null;
          try {
            const videoResponse = await fetch(videoFetchUrl);
            if (videoResponse.ok) {
              const videoBuffer = await videoResponse.arrayBuffer();
              const videoBytes = new Uint8Array(videoBuffer);
              const fileName = `generated-videos/${videoRecord.id}-${Date.now()}.mp4`;

              const { data: uploadData, error: uploadError } = await supabase.storage
                .from("generated-videos")
                .upload(fileName, videoBytes, {
                  contentType: "video/mp4",
                  upsert: true,
                });

              if (!uploadError && uploadData) {
                const { data: { publicUrl } } = supabase.storage
                  .from("generated-videos")
                  .getPublicUrl(fileName);
                storageUrl = publicUrl;
                console.log("Video uploaded to storage:", storageUrl);
              } else {
                console.error("Storage upload error:", uploadError);
              }
            } else {
              console.error("Failed to download video:", videoResponse.status);
            }
          } catch (uploadErr) {
            console.error("Error uploading video to storage:", uploadErr);
          }

          const finalVideoUrl = storageUrl || null;

          // Update video record with completed status and URL
          await supabase
            .from("generated_videos")
            .update({ 
              status: "completed",
              video_url: finalVideoUrl,
            })
            .eq("id", videoRecord.id);

          console.log(`Video generation completed for project ${projectId}, video ${videoRecord.id}`);

          // Return the updated video record
          return new Response(
            JSON.stringify({
              success: true,
              video: {
                ...videoRecord,
                status: "completed",
                video_url: finalVideoUrl,
              },
              message: "Video generation completed successfully.",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      // Check for error in operation
      if (operation.error) {
        console.error("Video generation operation error:", operation.error);
        await supabase
          .from("generated_videos")
          .update({ status: "failed" })
          .eq("id", videoRecord.id);

        return new Response(
          JSON.stringify({
            success: false,
            error: `Video generation failed: ${operation.error.message || JSON.stringify(operation.error)}`,
            video: videoRecord,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // If video generation didn't complete within time, mark as pending
      await supabase
        .from("generated_videos")
        .update({ status: "pending" })
        .eq("id", videoRecord.id);

      console.log(`Video generation pending (timeout) for project ${projectId}, video ${videoRecord.id}`);

      return new Response(
        JSON.stringify({
          success: true,
          video: { ...videoRecord, status: "pending" },
          message: "Video generation in progress. Check status for updates.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );

    } catch (genError) {
      console.error("Video generation error:", genError);
      
      // Mark as failed
      await supabase
        .from("generated_videos")
        .update({ status: "failed" })
        .eq("id", videoRecord.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: genError instanceof Error ? genError.message : "Video generation failed",
          video: videoRecord,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

  } catch (error) {
    console.error("Generate video error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildVideoPrompt(
  sceneDescription: string, 
  prdData?: PrdData
): string {
  // Build PRD context
  const prdParts: string[] = [];
  if (prdData?.selectedDirection) {
    prdParts.push(`Product: ${prdData.selectedDirection}`);
  }
  if (prdData?.targetAudience) {
    prdParts.push(`Target Audience: ${prdData.targetAudience}`);
  }
  if (prdData?.designStyle) {
    prdParts.push(`Design Style: ${prdData.designStyle}`);
  }
  if (prdData?.coreFeatures?.length) {
    prdParts.push(`Core Features: ${prdData.coreFeatures.join(", ")}`);
  }
  
  const prdContext = prdParts.length > 0 
    ? `\n\nProduct Context:\n${prdParts.join("\n")}` 
    : "";

  return `Create a 6-second professional product showcase video:

Scene Description: ${sceneDescription}${prdContext}

VIDEO SPECIFICATIONS:
- Duration: 6 seconds
- Resolution: 720p or higher
- Frame rate: 24fps
- Style: Cinematic product showcase

CINEMATOGRAPHY:
- Smooth camera movements (slow pan, gentle rotation, or subtle zoom)
- Professional lighting with soft shadows
- Clean background that complements the scene
- Focus on product details and usability

MOOD & TONE:
- Professional and premium feel
- Natural and authentic presentation
- Warm and inviting color palette
- Shallow depth of field for cinematic quality

PRODUCT CONSISTENCY (if based on product image):
- Product appearance MUST match exactly - shape, color, texture
- Do NOT alter any design details
- Product remains the focal point throughout
- Only add camera movement and environmental changes

OUTPUT: A smooth, loopable product video suitable for marketing and e-commerce.`;
}
