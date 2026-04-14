import { env } from '../config/env';

export interface GoogleBook {
  id: string;
  title: string;
  authors: string[];
  publishedDate?: string;
  language?: string;
  description?: string;
  thumbnail?: string;
}

interface VolumeInfo {
  title?: string;
  authors?: string[];
  publishedDate?: string;
  language?: string;
  description?: string;
  imageLinks?: { thumbnail?: string };
}

interface ApiItem {
  id: string;
  volumeInfo: VolumeInfo;
}

interface ApiResponse {
  totalItems?: number;
  items?: ApiItem[];
}

function mapItem(item: ApiItem): GoogleBook {
  const v = item.volumeInfo;
  return {
    id: item.id,
    title: v.title ?? 'Unknown Title',
    authors: v.authors ?? [],
    publishedDate: v.publishedDate,
    language: v.language,
    description: v.description,
    // Google Books returns http thumbnails; force https
    thumbnail: v.imageLinks?.thumbnail?.replace('http://', 'https://'),
  };
}

async function fetchVolumes(params: URLSearchParams): Promise<GoogleBook[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?${params}`;
  console.log(`[GoogleBooks] curl -s "${url}"`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Books API error: ${res.status}`);
  const data = (await res.json()) as ApiResponse;
  return (data.items ?? []).map(mapItem);
}

export async function searchBooks(query: string): Promise<GoogleBook[]> {
  // Primary: search by title with Russian language preference
  let results = await fetchVolumes(
    new URLSearchParams({
      q: `intitle:${query}`,
      langRestrict: 'ru',
      maxResults: '5',
      key: env.googleKey,
    })
  );

  // Fallback: broader search without language restriction
  if (results.length === 0) {
    results = await fetchVolumes(
      new URLSearchParams({
        q: query,
        maxResults: '5',
        key: env.googleKey,
      })
    );
  }

  return results;
}
