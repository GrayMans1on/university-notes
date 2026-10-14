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
        lessons.put(new JSONObject("{\"day\":0,\"pair\":1,\"title\":\"English\",\"weeks\":[1],\"subgroup\":1}"));
        lessons.put(new JSONObject("{\"day\":0,\"pair\":2,\"title\":\"Math\",\"weeks\":[1,2]}"));
        schedule.put("lessons", lessons);
        return new JSONObject().put("schedule", schedule);
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
    public void pathTraversalIsRejected() {
        assertFalse(ContentStore.safe("../notes/index.html"));
        assertFalse(ContentStore.safe("assets/../../index.html"));
        assertFalse(ContentStore.safe("/index.html"));
        assertFalse(ContentStore.safe("assets\\index.html"));
        assertTrue(ContentStore.safe("notes/informatics/index.html"));
    }
}
