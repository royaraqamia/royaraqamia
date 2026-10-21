import { afterEach, describe, expect, it, vi } from 'vitest';
import { updatePost, uploadImage } from '../blogpress';

const NETWORK_MESSAGE = 'تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.';
const REQUEST_FALLBACK = 'تعذّر إتمام الطلب. أعد المحاولة.';

const FIELDS = {
  slug: 'post',
  content: 'نصّ',
  cover_image: '',
  meta_title: '',
  meta_desc: '',
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// #402 moved the transport's own failures into Arabic; #475 is the promise that
// no BlogPress surface renders a browser string like `Failed to fetch` instead.
describe('BlogPress failures speak Arabic', () => {
  it('answers a media upload that never left with the Arabic transport message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await uploadImage(new FormData());

    expect(result).toEqual({ error: NETWORK_MESSAGE });
  });

  it('falls back to Arabic when a media upload is refused without a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));

    await expect(uploadImage(new FormData())).resolves.toEqual({ error: REQUEST_FALLBACK });
  });

  it('keeps the URL of a successful media upload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { url: 'https://cdn.example/a.png' }))
    );

    await expect(uploadImage(new FormData())).resolves.toEqual({
      url: 'https://cdn.example/a.png',
    });
  });

  it('reports a save whose request never left in Arabic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(updatePost('p-1', FIELDS)).resolves.toEqual({ message: NETWORK_MESSAGE });
  });

  it('keeps the saved message and field errors of an answered save', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { message: 'تمَّ حفظ المنشور' }))
      .mockResolvedValueOnce(jsonResponse(200, { errors: { slug: ['مطلوب'] } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updatePost('p-1', FIELDS)).resolves.toEqual({ message: 'تمَّ حفظ المنشور' });
    await expect(updatePost('p-1', FIELDS)).resolves.toEqual({ errors: { slug: ['مطلوب'] } });
  });
});
