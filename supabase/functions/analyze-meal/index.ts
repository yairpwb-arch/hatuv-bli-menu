import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meal } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `אתה מאמן תזונה תומך ומעודד. נתח את הארוחה על פי עקרונות אכילה בריאה.
אל תספור קלוריות! 
התמקד באיכות המזון ובאיזון.
אם הארוחה מאוזנת (חלבון + ירקות), שבח אותה.
אם יש מקום לשיפור, הצע בעדינות שיפור קטן לפעם הבאה.
ענה בעברית, בקצרה (2-3 משפטים), ובטון חיובי ומעודד.`
          },
          {
            role: 'user',
            content: `הארוחה שלי: ${meal}`
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ feedback: 'המערכת עמוסה כרגע, נסה שוב מאוחר יותר.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const feedback = data.choices?.[0]?.message?.content || 'ארוחה נרשמה!';

    return new Response(JSON.stringify({ feedback }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in analyze-meal:', error);
    return new Response(JSON.stringify({ feedback: 'ארוחה טובה! המשך כך.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
