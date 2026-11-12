import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const recorder = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/frontend/state/chats/use-voice-recorder', () => ({
  useVoiceRecorder: () => ({
    isRecording: false,
    isPreparing: false,
    elapsedMs: 0,
    levels: [],
    error: null,
    ...recorder,
  }),
  VOICE_NOTE_MAX_MS: 300_000,
}));

import { ChatComposer } from '@/frontend/ui/chats/chat-composer';

function renderComposer(onRecorded = vi.fn()) {
  render(
    <ChatComposer
      value=""
      onValueChange={() => undefined}
      onSend={() => undefined}
      files={[]}
      onAddFiles={() => undefined}
      onRemoveFile={() => undefined}
      onRecorded={onRecorded}
      disabled={false}
      placeholder="اكتب رسالة"
      ariaLabel="نصّ الرسالة"
      sendLabel="إرسال"
      sendIcon={<span aria-hidden />}
    />
  );
  return { mic: screen.getByRole('button', { name: 'تسجيل رسالة صوتية' }), onRecorded };
}

describe('ChatComposer recording gesture', () => {
  beforeEach(() => {
    recorder.start.mockReset().mockResolvedValue(true);
    recorder.cancel.mockReset();
  });

  it('captures the pointer, so a slide away still reaches this element', () => {
    const { mic } = renderComposer();
    const capture = vi.fn();
    // jsdom has no pointer capture; the handler only has to ask for it.
    (mic as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = capture;

    fireEvent.pointerDown(mic, { pointerId: 7, clientX: 10, clientY: 10 });

    expect(capture).toHaveBeenCalledWith(7);
  });

  it('throws the clip away when the release comes after the slide', () => {
    const { mic } = renderComposer();

    fireEvent.pointerDown(mic, { pointerId: 7, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(mic, { pointerId: 7, clientX: 300, clientY: 10 });
    fireEvent.pointerUp(mic, { pointerId: 7, clientX: 300, clientY: 10 });

    expect(recorder.cancel).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
  });

  it('sends when the release stays on the button', () => {
    const { mic, onRecorded } = renderComposer();

    fireEvent.pointerDown(mic, { pointerId: 7, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(mic, { pointerId: 7, clientX: 12, clientY: 12 });

    expect(recorder.cancel).not.toHaveBeenCalled();
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it('throws the clip away when the browser cancels the pointer', () => {
    const { mic } = renderComposer();

    fireEvent.pointerDown(mic, { pointerId: 7, clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(mic, { pointerId: 7 });

    expect(recorder.cancel).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
  });
});
