package ru.graymansion.study;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import static org.junit.Assert.*;

public class ScheduleTest {
    private JSONObject data() throws Exception {
        JSONObject schedule = new JSONObject().put("anchor", "2026-09-28");
        schedule.put("bells", new JSONObject("{\"1\":[\"08:00\",\"09:30\"],\"2\":[\"09:40\",\"11:10\"]}"));
        JSONArray lessons = new JSONArray();
        lessons.put(new JSONObject("{\"id\":\"english\",\"day\":0,\"pair\":1,\"title\":\"English\",\"weeks\":[1],\"subgroup\":1}"));
        lessons.put(new JSONObject("{\"id\":\"math\",\"day\":0,\"pair\":2,\"title\":\"Math\",\"weeks\":[1,2]}"));
        schedule.put("lessons", lessons);
        return new JSONObject().put("schedule", schedule);
    }

    @Test
    public void ongoingWidgetShowsEndAndUpcomingShowsStart() throws Exception {
        JSONObject next = new JSONObject("{\"start\":\"09:40\",\"end\":\"11:10\",\"ongoing\":true}");
        assertEquals("до 11:10", Schedule.nextTime(next));
        next.put("ongoing", false);
        assertEquals("09:40", Schedule.nextTime(next));
    }

    @Test
    public void cycleUsesMondayAndHandlesEarlierDates() {
        LocalDate anchor = LocalDate.parse("2026-09-28");
        assertEquals(1, Schedule.week(LocalDate.parse("2026-10-04"), anchor));
        assertEquals(2, Schedule.week(LocalDate.parse("2026-10-05"), anchor));
        assertEquals(1, Schedule.week(LocalDate.parse("2026-10-12"), anchor));
        assertEquals(2, Schedule.week(LocalDate.parse("2026-09-21"), anchor));
    }

    @Test
    public void subgroupDoesNotLeakOtherGroups() throws Exception {
        assertEquals(2, Schedule.lessons(data(), LocalDate.parse("2026-10-12"), 1).size());
        assertEquals(1, Schedule.lessons(data(), LocalDate.parse("2026-10-12"), 2).size());
    }

    @Test
    public void currentLessonRemainsUntilEndAndThenAdvances() throws Exception {
        assertEquals("English", Schedule.next(data(), ZonedDateTime.parse("2026-10-12T08:20:00+05:00"), 1).getString("title"));
        assertTrue(Schedule.next(data(), ZonedDateTime.parse("2026-10-12T08:20:00+05:00"), 1).getBoolean("ongoing"));
        assertEquals("Math", Schedule.next(data(), ZonedDateTime.parse("2026-10-12T09:30:00+05:00"), 1).getString("title"));
        assertFalse(Schedule.next(data(), ZonedDateTime.parse("2026-10-12T09:30:00+05:00"), 1).getBoolean("ongoing"));
    }

    @Test
    public void weekendFindsNextTeachingDay() throws Exception {
        JSONObject next = Schedule.next(data(), ZonedDateTime.parse("2026-10-11T10:00:00+05:00"), 1);
        assertEquals("2026-10-12", next.getString("date"));
        assertEquals("08:00", next.getString("start"));
    }

    @Test
    public void movedLessonUsesDateGroupAndExplicitTimeWithoutChangingCycle() throws Exception {
        JSONObject data = data();
        JSONObject schedule = data.getJSONObject("schedule");
        String base = schedule.getJSONArray("lessons").toString();
        JSONObject event = new JSONObject().put("id", "move-1").put("action", "move")
            .put("groups", new JSONArray().put("default")).put("subgroups", new JSONArray().put(1))
            .put("source", new JSONObject().put("date", "2026-10-12").put("lessonId", "english"))
            .put("target", new JSONObject().put("date", "2026-10-13").put("lesson", new JSONObject()
                .put("pair", 2).put("start", "10:00").put("end", "11:30").put("room", "326")));
        JSONArray events = new JSONArray().put(event);
        schedule.put("exceptions", events);
        assertEquals(1, Schedule.lessons(data, LocalDate.parse("2026-10-12"), 1).size());
        assertEquals(2, Schedule.lessons(data, LocalDate.parse("2026-10-12"), 1, "other").size());
        assertEquals(0, Schedule.lessons(data, LocalDate.parse("2026-10-13"), 2).size());
        JSONObject next = Schedule.next(data, ZonedDateTime.parse("2026-10-13T10:20:00+05:00"), 1);
        assertEquals("10:00", next.getString("start"));
        assertEquals("11:30", next.getString("end"));
        assertEquals("326", next.getString("room"));
        assertTrue(next.getBoolean("ongoing"));
        WidgetTimeline timeline = WidgetTimeline.build(data, LocalDate.parse("2026-10-13"), 1, 620, 100);
        assertEquals("10:00", timeline.rows.get(1).start);
        assertTrue(timeline.rows.get(1).ongoing);
        assertEquals(2, Schedule.lessons(data, LocalDate.parse("2026-10-26"), 1).size());
        events.put(new JSONObject().put("id", "undo-1").put("action", "revoke")
            .put("supersedes", new JSONArray().put("move-1")));
        assertEquals(2, Schedule.lessons(data, LocalDate.parse("2026-10-12"), 1).size());
        assertEquals(0, Schedule.lessons(data, LocalDate.parse("2026-10-13"), 1).size());
        assertEquals(base, schedule.getJSONArray("lessons").toString());
    }

    @Test
    public void permanentRoomChangesKeepPastDatesAndCanBeRolledBack() throws Exception {
        JSONObject data = data();
        JSONArray events = new JSONArray().put(new JSONObject().put("id", "room-1").put("action", "replace")
            .put("lessonId", "math").put("effectiveFrom", "2026-10-12").put("patch", new JSONObject().put("room", "326")));
        data.getJSONObject("schedule").put("permanentChanges", events);
        assertEquals("326", Schedule.lessons(data, LocalDate.parse("2026-10-12"), 1).get(1).getString("room"));
        assertEquals("326", Schedule.lessons(data, LocalDate.parse("2026-10-26"), 1).get(1).getString("room"));
        assertFalse(Schedule.lessons(data, LocalDate.parse("2026-10-05"), 1).get(0).has("room"));
        events.put(new JSONObject().put("id", "undo-room").put("action", "revoke").put("effectiveFrom", "2026-10-19")
            .put("supersedes", new JSONArray().put("room-1")));
        assertEquals("326", Schedule.lessons(data, LocalDate.parse("2026-10-12"), 1).get(1).getString("room"));
        assertFalse(Schedule.lessons(data, LocalDate.parse("2026-10-26"), 1).get(1).has("room"));
    }

    @Test
    public void pathTraversalIsRejected() {
        assertFalse(ContentStore.safe("../notes/index.html"));
        assertFalse(ContentStore.safe("assets/../../index.html"));
        assertFalse(ContentStore.safe("/index.html"));
        assertFalse(ContentStore.safe("assets\\index.html"));
        assertTrue(ContentStore.safe("notes/informatics/index.html"));
    }
}
