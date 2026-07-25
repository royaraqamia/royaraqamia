export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    return data.success === true;
  } catch {
    return false;
  }
}
