export const COMMUNITY_PAGE_SIZE = 9;

/**
 * The feed appends in the browser, so an unbounded session would grow the DOM
 * and the hydrated card/listener count with every tap. Five pages (45 cards)
 * is a long read; a direct `?cursor=` link still reaches any older page.
 */
export const COMMUNITY_MAX_APPENDED_PAGES = 4;
