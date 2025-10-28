// Translation service using OpenAI
// This module handles translation of text content to different languages

interface TranslationOptions {
  targetLanguage: string;
  sourceLanguage?: string;
  context?: string;
}

/**
 * Translate text to a target language using AI
 * @param text - The text to translate
 * @param options - Translation options including target language
 * @returns Translated text
 */
export async function translateText(
  text: string,
  options: TranslationOptions
): Promise<string> {
  const { targetLanguage, sourceLanguage = 'English', context } = options;

  // Skip translation if text is empty or only whitespace
  if (!text || text.trim().length === 0) {
    return text;
  }

  // Skip translation for very short text that might be code or symbols
  if (text.trim().length < 2) {
    return text;
  }

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      console.warn('OPENAI_API_KEY not configured, using mock translation');
      return mockTranslate(text, targetLanguage);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(),
          },
          {
            role: 'user',
            content: buildTranslationPrompt(text, sourceLanguage, targetLanguage, context),
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error(`Translation API failed: ${response.status}`);
    }

    const data = await response.json();
    const translatedText: string | undefined = data?.choices?.[0]?.message?.content;

    if (!translatedText || typeof translatedText !== 'string') {
      console.error('Unexpected OpenAI response format:', data);
      throw new Error('Unexpected translation response');
    }

    return translatedText.trim();
  } catch (error) {
    console.error('Translation error:', error);
    // Fallback to mock translation on error
    return mockTranslate(text, targetLanguage);
  }
}

/**
 * Build a translation prompt for the AI model
 */
function buildTranslationPrompt(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  context?: string
): string {
  let prompt = `Translate the following ${sourceLanguage} text to ${targetLanguage}.`;

  if (context) {
    prompt += `\nContext: ${context}`;
  }

  prompt += `\n\nText to translate:\n${text}\n\nTranslation:`;

  return prompt;
}

function buildSystemPrompt(): string {
  return [
    'You are a professional translator. Follow these rules strictly:',
    '1) Output ONLY the translated text, no commentary',
    '2) Preserve all HTML tags exactly (e.g., <strong>, <em>, <a>)',
    '3) Preserve formatting, line breaks, and spacing',
    '4) Maintain the same tone and style as the original',
    '5) Keep proper nouns/brand names/technical terms when appropriate',
    '6) Preserve placeholder variables exactly (e.g., {{name}})',
    '7) If target language is right-to-left (e.g., Arabic), translate appropriately',
  ].join('\n');
}

/**
 * Mock translation function for testing/fallback
 * Adds a language prefix to indicate translation
 */
function mockTranslate(text: string, targetLanguage: string): string {
  // For testing purposes, add a prefix to show it's "translated"
  return `[${targetLanguage}] ${text}`;
}

/**
 * Batch translate multiple texts to improve efficiency
 */
export async function translateBatch(
  texts: string[],
  options: TranslationOptions
): Promise<string[]> {
  // For now, translate sequentially
  // In production, you might want to batch these into fewer API calls
  const translations = await Promise.all(
    texts.map(text => translateText(text, options))
  );

  return translations;
}

/**
 * Language mapping for common language names to their locale codes
 */
export const LANGUAGE_MAP: Record<string, { name: string; code: string }> = {
  'en': { name: 'English', code: 'en' },
  'fr-FR': { name: 'French', code: 'fr' },
  'es': { name: 'Spanish', code: 'es' },
  'ar': { name: 'Arabic', code: 'ar' },
  'de': { name: 'German', code: 'de' },
  'it': { name: 'Italian', code: 'it' },
  'pt': { name: 'Portuguese', code: 'pt' },
  'ja': { name: 'Japanese', code: 'ja' },
  'zh': { name: 'Chinese', code: 'zh' },
  'ko': { name: 'Korean', code: 'ko' },
};

/**
 * Get language display name from locale code
 */
export function getLanguageName(localeCode: string): string {
  const lang = LANGUAGE_MAP[localeCode];
  return lang ? lang.name : localeCode;
}

