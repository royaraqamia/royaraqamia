export const COMMUNITY_TAGS = {
  index: 'community-index',
  slugs: 'community-slugs',
  categories: 'community-categories',
  postCategories: 'community-post-categories',
  postBySlug: 'community-post-by-slug',
  post: 'community-post',
} as const;

export const COMMUNITY_MUTATION_TAGS = Object.values(COMMUNITY_TAGS);
