package ru.graymansion.study;

import org.junit.Test;
import static org.junit.Assert.*;

public class GithubScheduleTest {
    @Test
    public void bridgeOnlyAllowsReadingBaseAndWritingScheduleHistory() {
        assertTrue(GithubSchedule.allowed("GET", "content/schedule.json"));
        assertTrue(GithubSchedule.allowed("PUT", "content/schedule-exceptions.json"));
        assertTrue(GithubSchedule.allowed("PUT", "content/schedule-overrides.json"));
        assertFalse(GithubSchedule.allowed("PUT", "content/schedule.json"));
        assertFalse(GithubSchedule.allowed("DELETE", "content/schedule-exceptions.json"));
        assertFalse(GithubSchedule.allowed("PUT", "content/Матанализ.md"));
        assertFalse(GithubSchedule.allowed("GET", "../secrets"));
    }
}
