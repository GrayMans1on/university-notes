package ru.graymansion.study;

import org.junit.Test;
import static org.junit.Assert.*;

public class ScheduleServiceTest {
    @Test
    public void onlyAnExplicitHttpsWorkerChangesEndpointIsAllowed() {
        assertTrue(ScheduleService.allowed("https://notes.example.workers.dev/changes"));
        assertFalse(ScheduleService.allowed("http://notes.example.workers.dev/changes"));
        assertFalse(ScheduleService.allowed("https://notes.example.workers.dev.evil.example/changes"));
        assertFalse(ScheduleService.allowed("https://user:password@notes.example.workers.dev/changes"));
        assertFalse(ScheduleService.allowed("https://notes.example.workers.dev/other"));
        assertFalse(ScheduleService.allowed("https://notes.example.workers.dev/changes?redirect=1"));
        assertFalse(ScheduleService.allowed("https://notes.example.workers.dev/changes#fragment"));
        assertFalse(ScheduleService.allowed(""));
    }
}
