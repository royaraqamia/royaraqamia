export interface ShareData {
  title: string;
  text: string;
  url: string;
}

/**
 * Check if the Web Share API is available
 */
export const canNativeShare = (): boolean => {
  return typeof navigator !== 'undefined' && 'share' in navigator;
};

/**
 * Share using the native Web Share API
 */
export const nativeShare = async (data: ShareData): Promise<boolean> => {
  if (!canNativeShare()) return false;

  try {
    await navigator.share(data);
    return true;
  } catch (error) {
    // User cancelled or share failed
    return false;
  }
};

/**
 * Copy text to clipboard
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return fallbackCopyToClipboard(text);
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return fallbackCopyToClipboard(text);
  }
};

/**
 * Fallback method for copying to clipboard
 */
const fallbackCopyToClipboard = (text: string): boolean => {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
    textArea.remove();
    return true;
  } catch {
    textArea.remove();
    return false;
  }
};

/**
 * Generate Twitter/X share URL
 */
export const getTwitterShareUrl = (data: ShareData): string => {
  const text = `${data.title}\n\n${data.text}`;
  return `https://twitter.com/intent/tweet?url=${encodeURIComponent(data.url)}&text=${encodeURIComponent(text)}`;
};

/**
 * Generate Facebook share URL
 */
export const getFacebookShareUrl = (url: string): string => {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
};

/**
 * Generate LinkedIn share URL
 */
export const getLinkedInShareUrl = (data: ShareData): string => {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(data.url)}`;
};

/**
 * Generate WhatsApp share URL
 */
export const getWhatsAppShareUrl = (data: ShareData): string => {
  const text = `${data.title}\n\n${data.text}\n\n${data.url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
};

/**
 * Generate Telegram share URL
 */
export const getTelegramShareUrl = (data: ShareData): string => {
  return `https://t.me/share/url?url=${encodeURIComponent(data.url)}&text=${encodeURIComponent(data.title)}`;
};

/**
 * Generate email share URL
 */
export const getEmailShareUrl = (data: ShareData): string => {
  const subject = data.title;
  const body = `${data.text}\n\n${data.url}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
