export interface WebflowPage {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  createdOn: string;
  lastUpdated: string;
  archived: boolean;
  draft: boolean;
  canBranch: boolean;
  isBranch: boolean;
  branchId?: string | null;
  parentId?: string;
  collectionId?: string;
  seo: {
    title?: string;
    description?: string;
  };
  openGraph: {
    title?: string;
    titleCopied: boolean;
    description?: string;
    descriptionCopied: boolean;
  };
  publishedPath: string;
}

export interface WebflowPagesResponse {
  pages: WebflowPage[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface WebflowLocale {
  id: string;
  cmsLocaleId: string;
  enabled: boolean;
  displayName: string;
  subdirectory?: string;
  tag: string;
  redirect?: boolean;
}

