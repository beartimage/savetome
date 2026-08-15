// Deterministic, topic-equivalent aliases for local/offline search. The
// server has a broader semantic retrieval layer; this keeps the same useful
// multilingual recall available before sign-in or while it is unavailable.
export const SEARCH_CONCEPTS = Object.freeze([
  ['movie', 'movies', 'film', 'films', 'cinema', 'kino', 'pelicula', 'películas', 'cine', 'filme', 'cinéma', '电影', '電影', '映画', '영화', 'кино', 'фильм', 'фильмы', 'сериал', 'сериалы', 'סרט', 'סרטים', 'فيلم', 'أفلام', 'चलचित्र', 'फ़िल्म'],
  ['television', 'tv', 'iptv', 'streaming tv', 'online tv', 'televisión', 'televisão', 'télévision', 'fernsehen', 'телевидение', 'тв', 'онлайн тв', '电视', 'テレビ', '텔레비전', 'טלוויזיה', 'تلفزيون', 'टेलीविजन'],
  ['music', 'audio', 'song', 'songs', 'musica', 'música', 'musique', 'musik', 'музыка', 'песня', 'музыки', '音楽', '音乐', '음악', 'מוזיקה', 'أغاني', 'موسيقى', 'संगीत'],
  ['travel', 'trip', 'tourism', 'viaje', 'voyage', 'reise', 'viagem', 'путешествие', 'поездка', '旅行', '여행', 'טיול', 'נסיעה', 'سفر', 'رحلة', 'यात्रा'],
  ['shopping', 'shop', 'store', 'compras', 'boutique', 'einkaufen', 'loja', 'покупки', 'магазин', '购物', '買い物', '쇼핑', 'קניות', 'متجر', 'تسوق', 'खरीदारी'],
  ['photo', 'photos', 'photography', 'fotografia', 'photographie', 'fotografie', 'фото', 'фотография', '摄影', '写真', '사진', 'צילום', 'تصوير', 'फ़ोटोग्राफ़ी'],
  ['design', 'ux', 'ui', 'diseño', 'conception', 'gestaltung', 'дизайн', '设计', 'デザイン', '디자인', 'עיצוב', 'تصميم', 'डिज़ाइन'],
  ['development', 'developer', 'programming', 'coding', 'software', 'desarrollo', 'développement', 'entwicklung', 'разработка', 'программирование', '开发', 'プログラミング', '개발', 'פיתוח', 'برمجة', 'تطوير', 'प्रोग्रामिंग'],
  ['ai', 'artificial intelligence', 'machine learning', 'inteligencia artificial', 'intelligence artificielle', 'künstliche intelligenz', 'искусственный интеллект', 'ии', '人工智能', '人工知能', '인공지능', 'בינה מלאכותית', 'ذكاء اصطناعي', 'कृत्रिम बुद्धिमत्ता'],
  ['recipe', 'recipes', 'cooking', 'food', 'receta', 'recette', 'rezept', 'receita', 'рецепт', 'еда', '食谱', 'レシピ', '요리', 'מתכון', 'وصفة', 'طبخ', 'व्यंजन'],
  ['news', 'noticias', 'actualités', 'nachrichten', 'notícias', 'новости', '新闻', 'ニュース', '뉴스', 'חדשות', 'أخبار', 'समाचार']
]);

export function normalizeSearchConcept(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase();
}

export function conceptAliasesForToken(token) {
  const normalized = normalizeSearchConcept(token);
  if (!normalized) return [];
  const aliases = SEARCH_CONCEPTS.find(group => group.some(alias => normalizeSearchConcept(alias) === normalized));
  return aliases ? [normalized, ...aliases.filter(alias => normalizeSearchConcept(alias) !== normalized)] : [normalized];
}
