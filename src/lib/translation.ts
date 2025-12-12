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
  const { targetLanguage } = options;

  // Skip translation if text is empty or only whitespace
  if (!text || text.trim().length === 0) {
    return text;
  }

  // Skip translation for very short text that might be code or symbols
  if (text.trim().length < 2) {
    return text;
  }

  // If the input likely contains HTML, translate only the text nodes and preserve tags
  if (isLikelyHtml(text)) {
    const tokens = splitHtmlIntoTokens(text);
    const translatedTokens = await Promise.all(
      tokens.map(async (token) => {
        if (isHtmlTagToken(token) || token.trim().length === 0) {
          return token; // preserve tags and pure whitespace as-is
        }
        // Skip tokens that are only invisible/control characters (Zero Width Joiner, etc.)
        if (isOnlyInvisibleChars(token)) {
          return token; // preserve invisible characters as-is
        }
        return translatePlainText(token, options);
      })
    );
    return translatedTokens.join('');
  }

  // Plain text path
  return translatePlainText(text, options);
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
 * Processes texts in smaller batches to avoid rate limits and timeouts
 */
export async function translateBatch(
  texts: string[],
  options: TranslationOptions
): Promise<string[]> {
  const BATCH_SIZE = 30; // Process 30 translations at a time for better performance
  
  // Deduplicate texts to avoid translating the same text multiple times
  const uniqueTexts = Array.from(new Set(texts));
  const hasDuplicates = uniqueTexts.length < texts.length;
  
  if (hasDuplicates) {
    console.log(`Deduplicating: ${texts.length} texts -> ${uniqueTexts.length} unique texts (${texts.length - uniqueTexts.length} duplicates)`);
  } else {
    console.log(`Starting translation of ${texts.length} texts in batches of ${BATCH_SIZE}...`);
  }
  
  // Create a map to store translations
  const translationMap = new Map<string, string>();
  
  // Process unique texts in batches
  for (let i = 0; i < uniqueTexts.length; i += BATCH_SIZE) {
    const batch = uniqueTexts.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(uniqueTexts.length / BATCH_SIZE);
    
    try {
      const batchTranslations = await Promise.all(
        batch.map(text => translateText(text, options))
      );
      
      // Store translations in map
      batch.forEach((text, idx) => {
        translationMap.set(text, batchTranslations[idx]);
      });
    } catch (error) {
      console.error(`Batch ${batchNumber}/${totalBatches} failed:`, error);
      // Use original texts as fallback for this batch
      batch.forEach(text => {
        translationMap.set(text, text);
      });
    }
  }
  
  // Map back to original order (including duplicates)
  const results = texts.map(text => translationMap.get(text) || text);
  
  console.log(`Completed translation of ${results.length} texts (${uniqueTexts.length} unique)`);
  return results;
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

// --- Internal helpers ---

function isLikelyHtml(input: string): boolean {
  // Quick heuristic: contains any angle-bracketed tag
  return /<[^>]+>/.test(input);
}

function splitHtmlIntoTokens(html: string): string[] {
  // Split into tags and text segments while keeping delimiters
  return html.split(/(<[^>]+>)/g);
}

function isHtmlTagToken(token: string): boolean {
  const t = token.trim();
  return t.startsWith('<') && t.endsWith('>');
}

/**
 * Check if a string contains only invisible/control characters
 * that shouldn't be translated (Zero Width Joiner, Zero Width Space, etc.)
 */
function isOnlyInvisibleChars(text: string): boolean {
  // Remove all invisible/control characters and check if anything remains
  // This includes: Zero Width Joiner (U+200D), Zero Width Space (U+200B),
  // Zero Width Non-Joiner (U+200C), Word Joiner (U+2060), etc.
  const visibleText = text.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '').trim();
  return visibleText.length === 0;
}

async function translatePlainText(
  text: string,
  options: TranslationOptions
): Promise<string> {
  const { targetLanguage, sourceLanguage = 'English', context } = options;

  // Capture leading and trailing whitespace to restore after translation
  const leadingWhitespace = text.match(/^(\s*)/)?.[1] || '';
  const trailingWhitespace = text.match(/(\s*)$/)?.[1] || '';
  const trimmedText = text.trim();

  // If text is only whitespace, return as-is
  if (trimmedText.length === 0) {
    return text;
  }

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      console.warn('OPENAI_API_KEY not configured, using mock translation');
      return leadingWhitespace + mockTranslate(trimmedText, targetLanguage) + trailingWhitespace;
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
            // Use trimmed text for translation to avoid confusing the AI
            content: buildTranslationPrompt(trimmedText, sourceLanguage, targetLanguage, context),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      
      // If unauthorized, provide helpful message
      if (response.status === 401) {
        throw new Error('OpenAI API key is invalid or expired. Please update OPENAI_API_KEY in .env.local');
      }
      
      throw new Error(`Translation API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Check if response has the expected structure
    if (!data?.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('OpenAI response missing choices array:', JSON.stringify(data, null, 2));
      throw new Error('OpenAI response missing choices array');
    }
    
    const translatedText: string | undefined = data.choices[0]?.message?.content;

    if (!translatedText || typeof translatedText !== 'string') {
      console.error('OpenAI response missing content:', {
        hasChoices: !!data?.choices,
        choicesLength: data?.choices?.length,
        firstChoice: data?.choices?.[0],
        hasMessage: !!data?.choices?.[0]?.message,
        hasContent: !!data?.choices?.[0]?.message?.content,
        contentType: typeof data?.choices?.[0]?.message?.content,
        fullData: JSON.stringify(data, null, 2)
      });
      throw new Error('OpenAI response missing translated content');
    }
    
    // Restore leading and trailing whitespace from original text
    return leadingWhitespace + translatedText.trim() + trailingWhitespace;
  } catch (error) {
    console.error('Translation error:', error);
    // Fallback to mock translation on error, preserving whitespace
    return leadingWhitespace + mockTranslate(trimmedText, targetLanguage) + trailingWhitespace;
  }
}

