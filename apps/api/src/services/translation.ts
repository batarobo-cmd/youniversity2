import type { Locale } from '@youniversity2/shared';
import { config } from '../config';

interface TranslateInput {
  title: string;
  description: string;
  sourceLocale: string;
  targetLocale: Locale;
}

interface TranslateOutput {
  title: string;
  description: string;
}

const localeNames: Record<string, string> = {
  sk: 'Slovak',
  en: 'English',
  cs: 'Czech',
  de: 'German',
  hu: 'Hungarian',
};

/** AI translation via OpenAI-compatible API (works with AWS Bedrock proxy too) */
export async function translateContent(input: TranslateInput): Promise<TranslateOutput> {
  const { title, description, sourceLocale, targetLocale } = input;

  if (!config.aiTranslation.apiKey) {
    return {
      title: `[${targetLocale.toUpperCase()}] ${title}`,
      description: `[${targetLocale.toUpperCase()}] ${description}`,
    };
  }

  const response = await fetch(`${config.aiTranslation.apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.aiTranslation.apiKey}`,
    },
    body: JSON.stringify({
      model: config.aiTranslation.model,
      messages: [
        {
          role: 'system',
          content: `You are a professional LMS translator. Translate educational content from ${localeNames[sourceLocale] ?? sourceLocale} to ${localeNames[targetLocale] ?? targetLocale}. Return ONLY valid JSON with keys "title" and "description". Preserve formatting and tone.`,
        },
        {
          role: 'user',
          content: JSON.stringify({ title, description }),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`Translation API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('Empty translation response');

  return JSON.parse(content) as TranslateOutput;
}

export async function translateLessonContent(
  sourceLocale: string,
  targetLocale: Locale,
  content: { title: string; content?: string },
): Promise<{ title: string; content?: string }> {
  const result = await translateContent({
    title: content.title,
    description: content.content ?? '',
    sourceLocale,
    targetLocale,
  });

  return {
    title: result.title,
    content: result.description || content.content,
  };
}
