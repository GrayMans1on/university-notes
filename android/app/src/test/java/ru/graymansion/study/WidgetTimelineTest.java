package ru.graymansion.study;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.time.LocalDate;
import static org.junit.Assert.*;

public class WidgetTimelineTest {
    private JSONObject data() throws Exception {
        JSONObject schedule = new JSONObject().put("anchor", "2026-09-28");
        schedule.put("bells", new JSONObject("{\"1\":[\"08:00\",\"09:30\"],\"2\":[\"09:40\",\"11:10\"],\"4\":[\"13:15\",\"14:45\"]}"));
        JSONArray lessons = new JSONArray();
        for (int pair : new int[] { 1, 2, 4 }) {
            lessons.put(new JSONObject().put("day", 0).put("pair", pair).put("title", "Pair " + pair)
                .put("weeks", new JSONArray("[1,2]")));
        }
        return new JSONObject().put("schedule", schedule.put("lessons", lessons));
    }

    @Test
    public void breakSpacingReflectsRealTimesAndMissingPairs() throws Exception {
        WidgetTimeline timeline = WidgetTimeline.build(data(), LocalDate.parse("2026-10-12"), 1, 600, 120);
        int[] breaks = timeline.rows.stream().filter(row -> row.gap > 0).mapToInt(row -> row.gap).toArray();
        assertArrayEquals(new int[] { 10, 125 }, breaks);
        assertTrue(WidgetTimeline.gapPadding(breaks[1]) > WidgetTimeline.gapPadding(breaks[0]));
    }

    @Test
    public void focusUsesCurrentThenUpcomingAndKeepsLastAtEndOfDay() throws Exception {
        LocalDate date = LocalDate.parse("2026-10-12");
        WidgetTimeline current = WidgetTimeline.build(data(), date, 1, 600, 120);
        assertEquals("Pair 2", current.rows.get(current.focus).lesson.getString("title"));
        assertTrue(current.rows.get(current.focus).ongoing);
        WidgetTimeline interval = WidgetTimeline.build(data(), date, 1, 700, 120);
        assertEquals("Pair 4", interval.rows.get(interval.focus).lesson.getString("title"));
        assertFalse(interval.rows.get(interval.focus).ongoing);
        WidgetTimeline finished = WidgetTimeline.build(data(), date, 1, 1100, 120);
        assertEquals("Pair 4", finished.rows.get(finished.focus).lesson.getString("title"));
    }

    @Test
    public void resizedWidgetIncludesRoomToCenterBoundaryLessons() throws Exception {
        WidgetTimeline compact = WidgetTimeline.build(data(), LocalDate.parse("2026-10-12"), 1, 470, 36);
        WidgetTimeline large = WidgetTimeline.build(data(), LocalDate.parse("2026-10-12"), 1, 470, 160);
        assertEquals(0, compact.rows.get(0).spacer);
        assertEquals(62, large.rows.get(0).spacer);
        assertTrue(large.scroll >= large.focus);
        assertTrue(large.scroll < large.rows.size());
    }

    @Test
    public void noLessonsStillProducesUsableWidgetContent() throws Exception {
        WidgetTimeline timeline = WidgetTimeline.build(data(), LocalDate.parse("2026-10-11"), 1, 600, 90);
        assertEquals("Сегодня пар нет", timeline.rows.get(timeline.focus).lesson.getString("title"));
    }
}
