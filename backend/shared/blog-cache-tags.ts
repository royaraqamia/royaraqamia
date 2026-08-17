export const BLOG_TAGS = {
  index: 'blog-index',
  slugs: 'blog-slugs',
  categories: 'blog-categories',
  postCategories: 'blog-post-categories',
  postBySlug: 'blog-post-by-slug',
  post: 'blog-post',
} as const;

export const BLOG_MUTATION_TAGS = Object.values(BLOG_TAGS);
