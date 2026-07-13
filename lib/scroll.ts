export function scrollToSection(sectionId: string): boolean {
  const section = document.getElementById(sectionId);
  if (section) {
    const navbarHeight = 80;
    const sectionTop = section.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({
      top: sectionTop - navbarHeight - 20,
      behavior: 'smooth',
    });
    return true;
  }
  return false;
}

export const scrollToTop = (): void => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
