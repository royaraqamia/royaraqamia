export interface ShortLink {
  code: string;
  originalUrl: string;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isBlocked: boolean;
}
