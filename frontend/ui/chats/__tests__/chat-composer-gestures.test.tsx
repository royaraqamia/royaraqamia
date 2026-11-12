import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const recorder = vi.hoisted(() => ({
  isRecording: false,
  elapsedMs: 0,
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/frontend/state/chats/use-voice-recorder', () => ({
  useVoiceRecorder: () => ({
    isPreparing: false,
    levels: [],
    error: null,
    ...recorder,
  }),
  VOICE_NOTE_MAX_MS: 300_000,
}));

import { ChatComposer } from '@/frontend/ui/chats/chat-composer';

/** A pointer event as the press tracker sees it: dispatched on `window`. */
function windowPointer(type: 'pointermove' | 'pointerup' | 'pointercancel', clientX: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, clientY: 10, pointerId: 7 });
  window.dispatchEvent(event);
}

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

function press(mic: HTMLElement) {
  fireEvent.pointerDown(mic, { pointerId: 7, clientX: 10, clientY: 10 });
}

describe('ChatComposer recording allowance', () => {
  function Composer({ maxDurationMs }: { maxDurationMs: number }) {
    return (
      <ChatComposer
        value=""
        onValueChange={() => undefined}
        onSend={() => undefined}
        files={[]}
        onAddFiles={() => undefined}
        onRemoveFile={() => undefined}
        onRecorded={() => undefined}
        maxDurationMs={maxDurationMs}
        disabled={false}
        placeholder="اكتب رسالة"
        ariaLabel="نصّ الرسالة"
        sendLabel="إرسال"
        sendIcon={<span aria-hidden />}
      />
    );
  }

  beforeEach(() => {
    recorder.isRecording = false;
    recorder.elapsedMs = 0;
    recorder.stop.mockReset().mockResolvedValue(null);
  });

  it('stops and sends at the allowance the thread passes', () => {
    recorder.isRecording = true;
    recorder.elapsedMs = 1_200;

    render(<Composer maxDurationMs={1_000} />);

    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it('keeps recording below the allowance', () => {
    recorder.isRecording = true;
    recorder.elapsedMs = 500;

    render(<Composer maxDurationMs={1_000} />);

    expect(recorder.stop).not.toHaveBeenCalled();
  });
});

describe('ChatComposer recording gesture', () => {
  beforeEach(() => {
    recorder.start.mockReset().mockResolvedValue(true);
    recorder.stop.mockReset().mockResolvedValue(null);
    recorder.cancel.mockReset();
    recorder.isRecording = false;
    recorder.elapsedMs = 0;
  });

  it('sends when the release stays on the press', () => {
    const { mic, onRecorded } = renderComposer();

    press(mic);
    windowPointer('pointerup', 12);

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(recorder.cancel).not.toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it('throws the clip away when the release comes after a slide', () => {
    const { mic } = renderComposer();

    press(mic);
    windowPointer('pointermove', 200);
    windowPointer('pointerup', 200);

    expect(recorder.cancel).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
  });

  it('measures the slide even when the release is the first event to move', () => {
    const { mic } = renderComposer();

    press(mic);
    windowPointer('pointerup', 200);

    expect(recorder.cancel).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
  });

  it('throws the clip away when the browser cancels the pointer', () => {
    const { mic } = renderComposer();

    press(mic);
    windowPointer('pointercancel', 10);

    expect(recorder.cancel).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
  });

  it('stops listening once the gesture has ended', () => {
    const { mic } = renderComposer();

    press(mic);
    windowPointer('pointerup', 12);
    windowPointer('pointerup', 12);

    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });
});
