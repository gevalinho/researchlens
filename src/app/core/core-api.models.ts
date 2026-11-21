export interface CoreAuthor {
  name?: string | null;
}

export interface CoreLink {
  url?: string | null;
  href?: string | null;
}

export interface CoreWork {
  id?: string | number | null;
  title?: string | null;
  authors?: (string | CoreAuthor)[] | null;
  abstract?: string | null;
  yearPublished?: number | string | null;
  publisher?: string | null;
  doi?: string | null;
  downloadUrl?: string | null;
  links?: (string | CoreLink)[] | null;
}

export interface CoreWorksResponse {
  totalHits: number;
  limit: number;
  offset: number;
  results: CoreWork[];
}

export interface ResearchPaper {
  id: string | null;
  title: string | null;
  authors: string[];
  abstract: string | null;
  yearPublished: number | null;
  publisher: string | null;
  doi: string | null;
  downloadUrl: string | null;
  links: string[];
  publicationUrl: string | null;
}

export interface CoreSearchResponse {
  totalHits: number;
  limit: number;
  offset: number;
  results: ResearchPaper[];
}
