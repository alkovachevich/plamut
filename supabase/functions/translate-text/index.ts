import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function normalizeSpaces(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitIntoChunks(text: string, maxChunkLength = 420): string[] {
  const chunks: string[] = [];
  let cursor = normalizeSpaces(text);
  while(cursor.length > maxChunkLength){
    let splitIndex = cursor.lastIndexOf(" ", maxChunkLength);
    if(splitIndex < 120){
      splitIndex = maxChunkLength;
    }
    chunks.push(cursor.slice(0, splitIndex).trim());
    cursor = cursor.slice(splitIndex).trim();
  }
  if(cursor){
    chunks.push(cursor);
  }
  return chunks.filter(Boolean);
}

async function translateChunk(chunk: string, fromLang: string, toLang: string): Promise<string> {
  const providers: Array<() => Promise<string>> = [
    async () => {
      const url =
        "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(chunk) +
        "&langpair=" +
        encodeURIComponent(`${fromLang}|${toLang}`);
      const response = await fetch(url);
      if(!response.ok){
        throw new Error(`MyMemory HTTP ${response.status}`);
      }
      const data = await response.json();
      return normalizeSpaces(data?.responseData?.translatedText || "");
    },
    async () => {
      const url =
        "https://translate.googleapis.com/translate_a/single?client=gtx" +
        "&sl=" + encodeURIComponent(fromLang) +
        "&tl=" + encodeURIComponent(toLang) +
        "&dt=t&q=" + encodeURIComponent(chunk);
      const response = await fetch(url);
      if(!response.ok){
        throw new Error(`Google HTTP ${response.status}`);
      }
      const data = await response.json();
      const translated = Array.isArray(data?.[0])
        ? data[0].map((part: unknown) => Array.isArray(part) ? String(part[0] || "") : "").join(" ")
        : "";
      return normalizeSpaces(translated);
    }
  ];

  for(const provider of providers){
    try {
      const translated = normalizeSpaces(await provider());
      if(translated){
        return translated;
      }
    } catch (_error) {
      continue;
    }
  }

  throw new Error("No translation provider returned a valid response");
}

serve(async (req) => {
  if(req.method === "OPTIONS"){
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if(req.method !== "POST"){
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  try {
    const payload = await req.json();
    const text = normalizeSpaces(payload?.text || "");
    const fromLang = normalizeSpaces(payload?.from_lang || payload?.fromLang || "");
    const toLang = normalizeSpaces(payload?.to_lang || payload?.toLang || "");

    if(!text || !fromLang || !toLang){
      return new Response(JSON.stringify({ error: "text, from_lang and to_lang are required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    const chunks = splitIntoChunks(text);
    const translatedChunks: string[] = [];
    for(const chunk of chunks){
      try {
        const translated = await translateChunk(chunk, fromLang, toLang);
        if(translated){
          translatedChunks.push(translated);
        }
      } catch (_error) {
        translatedChunks.push(chunk);
      }
    }

    const translatedText = normalizeSpaces(translatedChunks.join(" "));
    return new Response(JSON.stringify({ translatedText }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || error || "Unknown error") }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }
});
