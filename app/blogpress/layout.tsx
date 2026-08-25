import type { Metadata } from 'next';
import { BlogPressLayout } from '@/frontend/ui/blogpress/blogpress-layout';

export const metadata: Metadata = {
  title: {
    default: 'BlogPress',
    template: '%s | BlogPress',
  },
};

export default function BlogPressLayoutRoute({ children }: { children: React.ReactNode }) {
  return <BlogPressLayout>{children}</BlogPressLayout>;
}
