export const COMMUNITY_TAGS = {
  index: 'community-index',
  slugs: 'community-slugs',
  categories: 'community-categories',
  postCategories: 'community-post-categories',
  postBySlug: 'community-post-by-slug',
  post: 'community-post',
  members: 'community-members',
  memberByUsername: 'community-member-by-username',
} as const;

export const COMMUNITY_MUTATION_TAGS = Object.values(COMMUNITY_TAGS);
