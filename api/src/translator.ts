export async function translateToEnglish(text: string): Promise<string> {
  const deeplKey = process.env.DEEPL_API_KEY?.trim();

  // Try DeepL if an API key is configured.
  if (deeplKey) {
    try {
      const endpoint = deeplKey.endsWith(':fx')
        ? 'https://api-free.deepl.com/v2/translate'
        : 'https://api.deepl.com/v2/translate';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${deeplKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: [text],
          target_lang: 'EN',
        }),
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = (await res.json()) as { translations?: Array<{ text: string }> };
        const translated = data.translations?.[0]?.text?.trim();
        if (translated) return translated;
      }
    } catch {
      // Degrade to free fallback.
    }
  }

  // Free fallback via MyMemory API.
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=fr|en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = (await res.json()) as { responseData?: { translatedText?: string } };
      const translated = data.responseData?.translatedText?.trim();
      if (translated) return translated;
    }
  } catch {
    // Degrade to original query.
  }

  return text;
}
