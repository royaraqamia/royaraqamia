package com.royaraqamia.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Locates the ASCII numeral runs in a dialog string so only those characters can
 * take the brand's digit face.
 *
 * The native update cards mix Arabic copy with version numbers, sizes and a
 * percentage. Setting the whole view to Aref Ruqaa would change the Arabic too,
 * so `DigitSpans` styles these ranges instead. A run may carry the punctuation
 * that belongs to the number (`.` `,` `:` `/`, and a trailing `%`) and stops at
 * the first character that does not.
 */
final class DigitRanges {

    private DigitRanges() {}

    static List<int[]> of(CharSequence text) {
        if (text == null || text.length() == 0) return Collections.emptyList();

        List<int[]> runs = new ArrayList<>();
        int start = -1;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= '0' && c <= '9') {
                if (start < 0) start = i;
            } else if (start < 0) {
                continue;
            } else if (c == '.' || c == ',' || c == ':' || c == '/') {
                // Punctuation inside a number: keep the run open.
            } else if (c == '%') {
                runs.add(new int[] { start, i + 1 });
                start = -1;
            } else {
                runs.add(new int[] { start, i });
                start = -1;
            }
        }
        if (start >= 0) runs.add(new int[] { start, text.length() });
        return runs;
    }
}
