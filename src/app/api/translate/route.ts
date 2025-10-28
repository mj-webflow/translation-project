import { NextRequest, NextResponse } from 'next/server';
import { translateBatch } from '@/lib/translation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { texts, targetLanguage, sourceLanguage, context } = body || {};

    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: 'texts must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!targetLanguage || typeof targetLanguage !== 'string') {
      return NextResponse.json(
        { error: 'targetLanguage is required' },
        { status: 400 }
      );
    }

    const filteredTexts = texts.filter((t: unknown) => typeof t === 'string' && t.trim().length > 0);
    if (filteredTexts.length === 0) {
      return NextResponse.json(
        { error: 'No valid texts to translate' },
        { status: 400 }
      );
    }

    const translations = await translateBatch(filteredTexts, {
      targetLanguage,
      sourceLanguage,
      context,
    });

    return NextResponse.json({ translations });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Translation service failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


