import { Link, useLocation } from 'react-router-dom';
import { CaretLeft, House } from '@phosphor-icons/react';

interface BreadcrumbItem {
  label: string;
  href: string;
  isRoute?: boolean;
}

export function Breadcrumb() {
  const location = useLocation();

  // Generate breadcrumb items based on current route
  const getBreadcrumbs = (): BreadcrumbItem[] => {
    const path = location.pathname;
    const breadcrumbs: BreadcrumbItem[] = [{ label: 'الرئيسية', href: '/', isRoute: true }];

    if (path === '/sahwatalinsan') {
      breadcrumbs.push({ label: 'صحوة الإنسان', href: '/sahwatalinsan', isRoute: true });
    }

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  // Don't show breadcrumb on homepage or landing pages
  if (location.pathname === '/' || location.pathname === '/sahwatalinsan') {
    return null;
  }

  return (
    <nav
      aria-label="مسار التنقل"
      className="container-padding py-4 border-b border-border/50"
      style={{ contentVisibility: 'auto' }}
    >
      <ol
        className="flex items-center gap-2 text-sm text-muted-foreground"
        itemScope
        itemType="https://schema.org/BreadcrumbList"
      >
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <li
              key={item.href}
              itemProp="itemListElement"
              itemScope
              itemType="https://schema.org/ListItem"
              className="flex items-center gap-2"
            >
              {index === 0 ? (
                <House className="w-4 h-4" aria-hidden="true" />
              ) : (
                <CaretLeft className="w-4 h-4 text-muted-foreground/50" aria-hidden="true" />
              )}

              {isLast ? (
                <span className="text-foreground font-medium" itemProp="name">
                  {item.label}
                </span>
              ) : (
                <>
                  {item.isRoute ? (
                    <Link
                      to={item.href}
                      className="hover:text-foreground transition-colors"
                      itemProp="item"
                    >
                      <span itemProp="name">{item.label}</span>
                    </Link>
                  ) : (
                    <a
                      href={item.href}
                      className="hover:text-foreground transition-colors"
                      itemProp="item"
                    >
                      <span itemProp="name">{item.label}</span>
                    </a>
                  )}
                </>
              )}
              <meta itemProp="position" content={String(index + 1)} />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
