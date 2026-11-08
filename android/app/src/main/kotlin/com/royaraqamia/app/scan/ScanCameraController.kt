package com.royaraqamia.app.scan

import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.Camera
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.view.Surface
import kotlin.math.abs

/**
 * The device's camera, opened only while the Scanner's viewfinder is on screen
 * (#932).
 *
 * Frames are delivered as NV21, whose first `width * height` bytes are the
 * luminance plane the decoder reads, so no picture is written to disk and none
 * leaves the phone (ADR-0034). The preview is a [SurfaceTexture] from the
 * Compose `TextureView`, rotated by the platform's own
 * [Camera.setDisplayOrientation], which is why the preview is upright without
 * the matrix arithmetic a Camera2 session would need.
 *
 * The controller runs on its own thread: opening a camera and receiving frames
 * are blocking platform calls, and the screen's frame must not wait on either.
 * Every entry point is safe to call after [stop].
 */
@Suppress("DEPRECATION")
internal class ScanCameraController(
    private val onFrame: (ByteArray, Int, Int) -> Unit,
    private val onReady: () -> Unit,
    private val onTorchAvailable: (Boolean) -> Unit,
    private val onFailure: () -> Unit,
) {
    private val thread = HandlerThread("scan-camera").apply { start() }
    private val handler = Handler(thread.looper)
    private val main = Handler(Looper.getMainLooper())
    private var camera: Camera? = null

    /** Opens the camera and starts the preview on [texture], or reports failure. */
    fun start(texture: SurfaceTexture, displayRotation: Int) {
        handler.post {
            try {
                val (id, opened) = openCamera() ?: throw IllegalStateException("no camera")
                camera = opened

                val parameters = opened.parameters
                val size = choosePreviewSize(parameters.supportedPreviewSizes)
                parameters.setPreviewSize(size.width, size.height)
                parameters.previewFormat = ImageFormat.NV21
                applyFocus(parameters)
                opened.parameters = parameters

                opened.setDisplayOrientation(displayRotationDegrees(id, displayRotation))
                opened.setPreviewTexture(texture)
                opened.setPreviewCallbackWithBuffer { data, source ->
                    if (data == null) return@setPreviewCallbackWithBuffer
                    try {
                        onFrame(data, size.width, size.height)
                    } finally {
                        // The buffer is handed back only after the decoder has
                        // read it, so a frame is never overwritten mid-decode.
                        source.addCallbackBuffer(data)
                    }
                }
                opened.addCallbackBuffer(ByteArray(size.width * size.height * 3 / 2))
                opened.startPreview()

                val torch =
                    parameters.supportedFlashModes?.contains(Camera.Parameters.FLASH_MODE_TORCH) ==
                        true
                main.post {
                    onTorchAvailable(torch)
                    onReady()
                }
            } catch (_: Exception) {
                main.post { onFailure() }
            }
        }
    }

    /** Turns the torch on or off, when the device has one. */
    fun setTorch(on: Boolean) {
        handler.post {
            val opened = camera ?: return@post
            runCatching {
                val parameters = opened.parameters
                parameters.flashMode =
                    if (on) Camera.Parameters.FLASH_MODE_TORCH else Camera.Parameters.FLASH_MODE_OFF
                opened.parameters = parameters
            }
        }
    }

    /** Releases the camera. A second call, or a call before [start], does nothing. */
    fun stop() {
        handler.post {
            runCatching { camera?.setPreviewCallbackWithBuffer(null) }
            runCatching { camera?.stopPreview() }
            runCatching { camera?.release() }
            camera = null
        }
        // `quitSafely` runs the cleanup above (it is not delayed) and then ends
        // the thread, so a frame callback cannot outlive the screen.
        thread.quitSafely()
    }

    private fun openCamera(): Pair<Int, Camera>? {
        val count = Camera.getNumberOfCameras()
        if (count == 0) return null
        val info = Camera.CameraInfo()
        var chosen = 0
        for (index in 0 until count) {
            Camera.getCameraInfo(index, info)
            if (info.facing == Camera.CameraInfo.CAMERA_FACING_BACK) {
                chosen = index
                break
            }
        }
        return Camera.open(chosen)?.let { chosen to it }
    }

    /** A 4:3 preview near 1280 x 960, so the viewfinder's 4:3 box is not stretched. */
    private fun choosePreviewSize(
        sizes: List<Camera.Size>,
    ): Camera.Size =
        sizes.minByOrNull { abs(it.width - TARGET_WIDTH) + abs(it.height - TARGET_HEIGHT) }
            ?: throw IllegalStateException("camera reports no preview size")

    private fun applyFocus(parameters: Camera.Parameters) {
        val modes = parameters.supportedFocusModes.orEmpty()
        val preferred =
            when {
                modes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE) ->
                    Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE
                modes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_VIDEO) ->
                    Camera.Parameters.FOCUS_MODE_CONTINUOUS_VIDEO
                else -> null
            }
        if (preferred != null) runCatching { parameters.focusMode = preferred }
    }

    /**
     * The preview rotation the platform's own camera computes: the sensor's
     * orientation against the display's, mirrored for a front-facing camera.
     */
    private fun displayRotationDegrees(cameraId: Int, displayRotation: Int): Int {
        val info = Camera.CameraInfo()
        Camera.getCameraInfo(cameraId, info)
        val degrees =
            when (displayRotation) {
                Surface.ROTATION_90 -> 90
                Surface.ROTATION_180 -> 180
                Surface.ROTATION_270 -> 270
                else -> 0
            }
        return if (info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT) {
            val result = (info.orientation + degrees) % 360
            (360 - result) % 360
        } else {
            (info.orientation - degrees + 360) % 360
        }
    }

    private companion object {
        const val TARGET_WIDTH = 1280
        const val TARGET_HEIGHT = 960
    }
}
