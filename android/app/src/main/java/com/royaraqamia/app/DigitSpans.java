package com.royaraqamia.app;

import android.graphics.Typeface;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextPaint;
import android.text.style.MetricAffectingSpan;
import android.widget.TextView;

import java.util.List;

/**
 * Paints the ASCII numerals in a view with the brand's digit face (Aref Ruqaa)
 * while leaving the surrounding Arabic in IBM Plex Sans Arabic.
 *
 * `res/font/aref_ruqaa_digits.ttf` is a digit-only subset of the same face the
 * web app ships, so the APK grows by a few kilobytes rather than another full
 * font. Called after every `setText` on a view that can contain numbers: a
 * `TextView` replaces its text, and with it the spans, on each update.
 */
final class DigitSpans {

    private DigitSpans() {}

    static void apply(TextView view, Typeface typeface) {
        if (view == null || typeface == null) return;

        CharSequence text = view.getText();
        List<int[]> runs = DigitRanges.of(text);
        if (runs.isEmpty()) return;

        SpannableString spanned = new SpannableString(text);
        for (int[] run : runs) {
            spanned.setSpan(
                    new DigitTypefaceSpan(typeface),
                    run[0],
                    run[1],
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        view.setText(spanned);
    }

    private static final class DigitTypefaceSpan extends MetricAffectingSpan {
        private final Typeface typeface;

        DigitTypefaceSpan(Typeface typeface) {
            this.typeface = typeface;
        }

        @Override
        public void updateDrawState(TextPaint paint) {
            paint.setTypeface(typeface);
        }

        @Override
        public void updateMeasureState(TextPaint paint) {
            paint.setTypeface(typeface);
        }
    }
}
