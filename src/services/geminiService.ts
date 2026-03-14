import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from "@google/genai";

const MAX_RETRIES = 5;
const INITIAL_BACKOFF = 2000; // 2 seconds

export async function callGeminiWithRetry(
  params: GenerateContentParameters,
  retries = MAX_RETRIES,
  backoff = INITIAL_BACKOFF
): Promise<GenerateContentResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  try {
    const response = await ai.models.generateContent(params);
    return response;
  } catch (error: any) {
    const isRateLimit = error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429;
    
    if (isRateLimit && retries > 0) {
      console.warn(`Gemini rate limit exceeded. Retrying in ${backoff}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return callGeminiWithRetry(params, retries - 1, backoff * 2);
    }

    if (isRateLimit) {
      throw new Error("Limite de uso da IA excedido. Por favor, aguarde um momento e tente novamente.");
    }

    throw error;
  }
}

export async function callGeminiStreamWithRetry(
  params: GenerateContentParameters,
  retries = MAX_RETRIES,
  backoff = INITIAL_BACKOFF
): Promise<any> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  try {
    const stream = await ai.models.generateContentStream(params);
    return stream;
  } catch (error: any) {
    const isRateLimit = error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429;
    
    if (isRateLimit && retries > 0) {
      console.warn(`Gemini rate limit exceeded (stream). Retrying in ${backoff}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return callGeminiStreamWithRetry(params, retries - 1, backoff * 2);
    }

    if (isRateLimit) {
      throw new Error("Limite de uso da IA excedido. Por favor, aguarde um momento e tente novamente.");
    }

    throw error;
  }
}
