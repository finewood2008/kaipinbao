import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
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

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

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

    const { landingPageId, viewCount, emailCount, conversionRate, dailyStats } = await req.json();

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY not configured");
    }

    // Calculate growth trend
    let viewGrowth = 0;
    let emailGrowth = 0;
    if (dailyStats && dailyStats.length >= 2) {
      const recentViews = dailyStats.slice(-3).reduce((sum: number, d: { views: number; emails: number }) => sum + d.views, 0);
      const earlierViews = dailyStats.slice(0, 3).reduce((sum: number, d: { views: number; emails: number }) => sum + d.views, 0);
      viewGrowth = earlierViews > 0 ? ((recentViews - earlierViews) / earlierViews) * 100 : 0;

      const recentEmails = dailyStats.slice(-3).reduce((sum: number, d: { views: number; emails: number }) => sum + d.emails, 0);
      const earlierEmails = dailyStats.slice(0, 3).reduce((sum: number, d: { views: number; emails: number }) => sum + d.emails, 0);
      emailGrowth = earlierEmails > 0 ? ((recentEmails - earlierEmails) / earlierEmails) * 100 : 0;
    }

    const prompt = `你是一位资深的跨境电商市场分析专家。请基于以下落地页数据，分析该产品是否适合进入开品阶段。

## 数据概览
- 总访问量: ${viewCount}
- 邮箱订阅数: ${emailCount}
- 转化率: ${conversionRate}%
- 访问量增长趋势: ${viewGrowth > 0 ? `+${viewGrowth.toFixed(1)}%` : `${viewGrowth.toFixed(1)}%`}
- 订阅增长趋势: ${emailGrowth > 0 ? `+${emailGrowth.toFixed(1)}%` : `${emailGrowth.toFixed(1)}%`}

## 行业基准参考
- 电商落地页平均转化率: 2-5%
- 优秀转化率: 10%+
- 建议开品的最低订阅数: 20-50个

## 分析要求
请综合评估并返回JSON格式的分析结果：

{
  "score": 0-100的开品评分,
  "recommendation": "proceed" | "reconsider" | "insufficient_data",
  "summary": "一句话总结开品建议",
  "insights": ["市场洞察1", "市场洞察2", "市场洞察3"],
  "nextSteps": ["建议行动1", "建议行动2", "建议行动3"]
}

评分标准：
- 80-100: 强烈建议开品，市场反馈积极
- 60-79: 建议开品，但需关注优化点
- 40-59: 谨慎考虑，建议收集更多数据
- 0-39: 暂不建议开品，需重新评估产品定位

只返回JSON，不要有其他文字。`;

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
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google API error:", errorText);
      throw new Error(`Google API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Extract JSON from response
    let analysis;
    try {
      // Try to find JSON in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Provide default analysis based on data
      analysis = {
        score: viewCount > 50 && conversionRate > 5 ? 75 : viewCount > 20 ? 55 : 35,
        recommendation: viewCount > 50 && conversionRate > 5 ? "proceed" : viewCount > 20 ? "reconsider" : "insufficient_data",
        summary: viewCount > 50 ? "市场反馈积极，建议考虑开品" : "数据量不足，建议继续推广收集更多反馈",
        insights: [
          `当前转化率为 ${conversionRate}%，${conversionRate > 5 ? "高于" : "接近"}行业平均水平`,
          `已收集 ${emailCount} 个潜在客户邮箱`,
          `访问量${viewGrowth > 0 ? "呈上升趋势" : "需要持续推广"}`,
        ],
        nextSteps: [
          viewCount < 100 ? "增加流量投放，扩大样本量" : "分析用户画像，优化投放策略",
          conversionRate < 5 ? "优化落地页文案和设计" : "开始样品生产准备",
          "设计首批订单优惠活动",
        ],
      };
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in analyze-landing-page:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
