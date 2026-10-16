package ru.graymansion.study;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class TextbooksTest {
    private JSONObject book() throws Exception {
        return new JSONObject().put("id", "math-1").put("url", "https://example.com/math.pdf")
            .put("sha256", new String(new char[64]).replace('\0', 'a')).put("size", 1024);
    }

    @Test
    public void catalogOnlyAllowsBoundedHttpsPdfMetadata() throws Exception {
        Textbooks.validate(book());
        for (String value : new String[] { "../math", "", "Math" }) {
            try { Textbooks.validate(book().put("id", value)); fail(); } catch (java.io.IOException expected) { }
        }
        for (String value : new String[] { "http://example.com/math.pdf", "https://user:password@example.com/math.pdf" }) {
            try { Textbooks.validate(book().put("url", value)); fail(); } catch (java.io.IOException expected) { }
        }
        try { Textbooks.validate(book().put("size", 200L * 1024 * 1024 + 1)); fail(); } catch (java.io.IOException expected) { }
        try { Textbooks.validate(book().put("sha256", "wrong")); fail(); } catch (java.io.IOException expected) { }
    }
}
