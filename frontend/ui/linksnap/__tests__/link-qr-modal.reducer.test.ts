import { describe, expect, it } from 'vitest';

import {
  linkQrInitialState,
  linkQrReducer,
  type LinkQrState,
} from '@/frontend/ui/linksnap/link-qr-modal.reducer';

function stateOf(patch: Partial<LinkQrState> = {}): LinkQrState {
  return { ...linkQrInitialState(), ...patch };
}

describe('linkQrInitialState', () => {
  it('starts with nothing generated', () => {
    expect(linkQrInitialState()).toEqual({ svg: null, error: false, generationKey: 0 });
  });
});

describe('generating', () => {
  it('clears the previous failure when generation starts', () => {
    expect(linkQrReducer(stateOf({ error: true }), { type: 'generationStarted' })).toMatchObject({
      error: false,
    });
  });

  it('keeps the SVG the generator answered with', () => {
    const state = linkQrReducer(stateOf({ svg: '<svg>old</svg>' }), {
      type: 'generated',
      svg: '<svg>new</svg>',
    });

    expect(state.svg).toBe('<svg>new</svg>');
  });

  it('records a failed generation without touching a painted SVG', () => {
    expect(
      linkQrReducer(stateOf({ svg: '<svg>old</svg>' }), { type: 'generationFailed' })
    ).toMatchObject({ svg: '<svg>old</svg>', error: true });
  });
});

describe('retrying', () => {
  it('drops the SVG and the failure and asks for another generation', () => {
    const state = linkQrReducer(stateOf({ svg: '<svg>old</svg>', error: true, generationKey: 2 }), {
      type: 'regenerationRequested',
    });

    expect(state).toEqual({ svg: null, error: false, generationKey: 3 });
  });
});
