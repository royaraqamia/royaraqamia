// Mapping between a decoded frame's coordinates and the box that shows it.
//
// The viewfinder paints the video with `object-cover`, so the frame is scaled to
// fill and cropped on one axis. A bounding box drawn without that correction
// would sit next to the code instead of on it.

export interface FrameTransform {
  /** Display pixels per frame pixel. */
  pxPerFrame: number;
  offsetX: number;
  offsetY: number;
}

export interface FrameTransformInput {
  videoWidth: number;
  videoHeight: number;
  frameWidth: number;
  frameHeight: number;
  boxWidth: number;
  boxHeight: number;
}

export function computeFrameTransform(input: FrameTransformInput): FrameTransform {
  const { videoWidth, videoHeight, frameWidth, frameHeight, boxWidth, boxHeight } = input;
  if (!videoWidth || !videoHeight || !frameWidth || !frameHeight || !boxWidth || !boxHeight) {
    return { pxPerFrame: 1, offsetX: 0, offsetY: 0 };
  }

  // `object-cover`: one axis matches the box exactly, the other overflows.
  const sourceToBox = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
  return {
    pxPerFrame: sourceToBox * (videoWidth / frameWidth),
    offsetX: (boxWidth - videoWidth * sourceToBox) / 2,
    offsetY: (boxHeight - videoHeight * sourceToBox) / 2,
  };
}

export function frameToDisplay(transform: FrameTransform, x: number, y: number) {
  return {
    x: transform.offsetX + x * transform.pxPerFrame,
    y: transform.offsetY + y * transform.pxPerFrame,
  };
}

export function displayToFrame(transform: FrameTransform, x: number, y: number) {
  return {
    x: (x - transform.offsetX) / transform.pxPerFrame,
    y: (y - transform.offsetY) / transform.pxPerFrame,
  };
}
