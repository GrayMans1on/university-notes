package ru.graymansion.study;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

final class Schedule {
    static final ZoneId ZONE = ZoneId.of("Asia/Yekaterinburg");

    static int week(LocalDate date, LocalDate anchor) {
        LocalDate monday = date.minusDays(date.getDayOfWeek().getValue() - 1);
        return Math.floorMod(ChronoUnit.WEEKS.between(anchor, monday), 2) + 1;
    }

    static List<JSONObject> lessons(JSONObject data, LocalDate date, int subgroup) throws Exception {
        JSONObject schedule = data.getJSONObject("schedule");
        int cycle = week(date, LocalDate.parse(schedule.getString("anchor")));
        List<JSONObject> result = new ArrayList<>();
        JSONArray lessons = schedule.getJSONArray("lessons");
        for (int i = 0; i < lessons.length(); i++) {
            JSONObject lesson = lessons.getJSONObject(i);
            JSONArray weeks = lesson.getJSONArray("weeks");
            boolean matches = false;
            for (int j = 0; j < weeks.length(); j++) {
                matches |= weeks.getInt(j) == cycle;
            }
            if (lesson.getInt("day") == date.getDayOfWeek().getValue() - 1 && matches
                && (!lesson.has("subgroup") || lesson.getInt("subgroup") == subgroup)) {
                result.add(lesson);
            }
        }
        result.sort(Comparator.comparingInt(lesson -> lesson.optInt("pair")));
        return result;
    }

    static JSONObject next(JSONObject data, ZonedDateTime now, int subgroup) throws Exception {
        JSONObject bells = data.getJSONObject("schedule").getJSONObject("bells");
        for (int day = 0; day < 15; day++) {
            LocalDate date = now.toLocalDate().plusDays(day);
            for (JSONObject lesson : lessons(data, date, subgroup)) {
                if (lesson.optBoolean("onlineCourse")) {
                    continue;
                }
                JSONArray time = bells.optJSONArray(String.valueOf(lesson.optInt("pair")));
                if (time == null) {
                    continue;
                }
                ZonedDateTime end = date.atTime(LocalTime.parse(time.getString(1))).atZone(ZONE);
                if (end.isAfter(now)) {
                    JSONObject result = new JSONObject(lesson.toString());
                    result.put("date", date.toString());
                    result.put("start", time.getString(0));
                    result.put("end", time.getString(1));
                    result.put("ongoing", !date.atTime(LocalTime.parse(time.getString(0))).atZone(ZONE).isAfter(now));
                    return result;
                }
            }
        }
        return null;
    }

    static int subgroup(Context context) {
        return context.getSharedPreferences("study", 0).getInt("subgroup", 1);
    }

    static String when(JSONObject lesson) {
        LocalDate date = LocalDate.parse(lesson.optString("date"));
        String day = date.equals(LocalDate.now(ZONE)) ? "Сегодня" : date.format(
            DateTimeFormatter.ofPattern("EEE, d MMM", new Locale("ru")));
        return day + " · " + lesson.optString("start") + "–" + lesson.optString("end");
    }

    static String room(JSONObject lesson) {
        if (lesson.optString("note").toLowerCase(new Locale("ru")).contains("онлайн")) {
            return "Онлайн";
        }
        return lesson.optString("place", lesson.has("room") ? "Ауд. " + lesson.optString("room") : "Кабинет не указан");
    }
}
