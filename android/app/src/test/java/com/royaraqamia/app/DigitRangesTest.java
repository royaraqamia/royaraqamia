package com.royaraqamia.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.List;

/**
 * The range finder behind the native dialogs' digit face: only the numerals take
 * Aref Ruqaa, and the Arabic around them stays in IBM Plex Sans Arabic.
 */
public class DigitRangesTest {

    private static String slice(CharSequence text, int[] range) {
        return text.subSequence(range[0], range[1]).toString();
    }

    @Test
    public void findsEachNumberInTheUpdateMetaLine() {
        String text = "تحديث من 1.0.2 إلى 1.0.4 · 7.1 م.ب";
        List<int[]> runs = DigitRanges.of(text);

        assertTrue(runs.size() == 3);
        assertTrue(slice(text, runs.get(0)).equals("1.0.2"));
        assertTrue(slice(text, runs.get(1)).equals("1.0.4"));
        assertTrue(slice(text, runs.get(2)).equals("7.1"));
    }

    @Test
    public void keepsNumberPunctuationInsideTheRun() {
        String text = "6.6 من 30 م.ب";
        List<int[]> runs = DigitRanges.of(text);

        assertTrue(runs.size() == 2);
        assertArrayEquals(new int[] { 0, 3 }, runs.get(0));
        assertArrayEquals(new int[] { 7, 9 }, runs.get(1));
    }

    @Test
    public void includesThePercentSign() {
        String text = "23%";
        List<int[]> runs = DigitRanges.of(text);

        assertTrue(runs.size() == 1);
        assertArrayEquals(new int[] { 0, 3 }, runs.get(0));
    }

    @Test
    public void returnsNothingWhenThereAreNoAsciiDigits() {
        assertTrue(DigitRanges.of("جاري تنزيل التَّحديث…").isEmpty());
        assertTrue(DigitRanges.of("").isEmpty());
        assertTrue(DigitRanges.of(null).isEmpty());
    }

    @Test
    public void ignoresArabicIndicDigits() {
        assertTrue(DigitRanges.of("\u0661\u0662\u0663").isEmpty());
    }

    @Test
    public void aRunMayStartAndEndTheString() {
        String text = "1,234.5";
        List<int[]> runs = DigitRanges.of(text);

        assertTrue(runs.size() == 1);
        assertArrayEquals(new int[] { 0, 7 }, runs.get(0));
        assertTrue(slice(text, runs.get(0)).equals("1,234.5"));
    }
}
