import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/backend/transport/bearer-auth';
import { createShortenUrlService } from '@/backend/config/linksnap';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { getClientIp } from '@/backend/transport/http';
import { shortenRateLimitPolicy } from '@/backend/config/rate-limiter';
import { getErrorMessage } from '@/backend/shared/errors';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { originalUrl, customCode } = body;

    const user = await getAuthenticatedUser(req);
    const userId = user ? user.id : null;

    const ip = getClientIp(req);
    const rateLimitResponse = await checkRateLimitApi(shortenRateLimitPolicy(userId, ip));
    if (rateLimitResponse) return rateLimitResponse;

    const service = createShortenUrlService();

    const newLink = await service.execute(originalUrl, userId, customCode);

    return NextResponse.json({
      success: true,
      link: {
        code: newLink.code,
        originalUrl: newLink.originalUrl,
        createdAt: newLink.createdAt.toISOString(),
        userId: newLink.userId,
      },
    });
  } catch (err: unknown) {
    console.error('Error in shorten API route:', err);
    return NextResponse.json({ success: false, error: getErrorMessage(err) }, { status: 400 });
  }
}
