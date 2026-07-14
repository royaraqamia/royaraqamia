export function scrollToSection(sectionId: string, offset?: number): boolean {
  const section = document.getElementById(sectionId);
  if (section) {
    const navbarHeight = offset ?? 80;
    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: sectionTop - navbarHeight - 20,
      behavior: 'smooth',
    });
    return true;
  }
  return false;
}

export function scrollToSectionWithRetry(
  sectionId: string,
  retries = 5,
  delay = 200
): { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const attempt = (remaining: number) => {
    if (scrollToSection(sectionId)) return;
    if (remaining > 0) {
      timeoutId = setTimeout(() => attempt(remaining - 1), delay);
    }
  };

  attempt(retries);

  return {
    cancel: () => {
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}

export function scrollToSectionAfterNavigation(
  sectionId: string,
  navigate: () => void,
  retries = 10,
  delay = 100
): { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  navigate();

  timeoutId = setTimeout(() => {
    const attempt = (remaining: number) => {
      const el = document.getElementById(sectionId);
      if (el) {
        const navbarHeight = 80;
        window.scrollTo({
          top: el.getBoundingClientRect().top + window.scrollY - (navbarHeight + 20),
          behavior: 'smooth',
        });
      } else if (remaining > 0) {
        timeoutId = setTimeout(() => attempt(remaining - 1), delay);
      }
    };
    attempt(retries);
  }, 300);

  return {
    cancel: () => {
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}

export const scrollToTop = (): void => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
