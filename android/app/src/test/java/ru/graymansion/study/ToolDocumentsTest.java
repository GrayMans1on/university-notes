package ru.graymansion.study;

import java.nio.charset.StandardCharsets;
import org.junit.Test;
import static org.junit.Assert.*;

public class ToolDocumentsTest {
    @Test
    public void exportsUtf8WithoutLosingCyrillic() {
        String value = "{\"title\":\"Схема\"}";
        assertEquals(value, new String(ToolDocuments.decode("flowchart.csuflow", "application/json", value), StandardCharsets.UTF_8));
    }

    @Test
    public void rejectsInvalidTypesNamesAndImagePayloads() {
        for (String[] request : new String[][] {
            { "../data", "text/plain", "x" }, { "run.html", "text/html", "x" },
            { "image.png", "image/png", "data:image/png;base64,eA==" }
        }) {
            try {
                ToolDocuments.decode(request[0], request[1], request[2]);
                fail("Invalid file must be rejected");
            } catch (IllegalArgumentException expected) {
                assertNotNull(expected);
            }
        }
    }
}
