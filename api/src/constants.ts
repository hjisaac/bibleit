export const DEFAULT_ENCODING = 'utf-8' as const;
export const DEFAULT_PORT = 7860;
export const DEFAULT_SEARCH_RATE_LIMIT = 60;
export const DEFAULT_GENERATE_RATE_LIMIT = 10;
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const MAX_QUERY_LENGTH = 500;
export const MAX_PASSAGES = 5;
export const MAX_PASSAGE_TEXT_LENGTH = 2000;
export const BACKEND_ONNX_NUM_THREADS = 1;

export const DEEPL_FREE_API_URL = 'https://api-free.deepl.com/v2/translate';
export const DEEPL_PRO_API_URL = 'https://api.deepl.com/v2/translate';
export const MYMEMORY_API_URL = 'https://api.mymemory.translated.net/get';
export const TRANSLATION_TIMEOUT_MS = 3000;

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_DEFAULT_MODEL = 'openrouter/free';

export const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
export const MISTRAL_DEFAULT_MODEL = 'mistral-small-latest';

export const COHERE_BASE_URL = 'https://api.cohere.ai/compatibility/v1';
export const COHERE_DEFAULT_MODEL = 'command-r';
