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
    static String nextTime(JSONObject next) {
        return next.optBoolean("ongoing") ? "до " + next.optString("end") : next.optString("start");
    }

    static final ZoneId ZONE = ZoneId.of("Asia/Yekaterinburg");

    static int week(LocalDate date, LocalDate anchor) {
        LocalDate monday = date.minusDays(date.getDayOfWeek().getValue() - 1);
        return Math.floorMod(ChronoUnit.WEEKS.between(anchor, monday), 2) + 1;
    }

    static JSONArray time(JSONObject schedule, JSONObject lesson) throws Exception {
        if (lesson.has("start") && lesson.has("end")) {
            return new JSONArray().put(lesson.getString("start")).put(lesson.getString("end"));
        }
        return schedule.getJSONObject("bells").optJSONArray(String.valueOf(lesson.optInt("pair")));
    }

    static JSONArray permanent(JSONObject schedule, LocalDate date) throws Exception {
        JSONArray events = schedule.optJSONArray("permanentChanges");
        JSONArray lessons = schedule.getJSONArray("lessons");
        JSONArray result = new JSONArray();
        java.util.Set<String> superseded = new java.util.HashSet<>();
        if (events != null) {
            for (int i = 0; i < events.length(); i++) {
                JSONObject event = events.getJSONObject(i);
                if (event.optString("effectiveFrom").compareTo(date.toString()) <= 0) {
                    JSONArray ids = event.optJSONArray("supersedes");
                    if (ids != null) {
                        for (int j = 0; j < ids.length(); j++) {
                            superseded.add(ids.getString(j));
                        }
                    }
                }
            }
        }
        for (int i = 0; i < lessons.length(); i++) {
            JSONObject lesson = new JSONObject(lessons.getJSONObject(i).toString());
            if (events != null) {
                for (int j = 0; j < events.length(); j++) {
                    JSONObject event = events.getJSONObject(j);
                    if (event.optString("action").equals("replace") && !superseded.contains(event.optString("id"))
                        && event.optString("effectiveFrom").compareTo(date.toString()) <= 0
                        && event.optString("lessonId").equals(lesson.optString("id"))) {
                        JSONObject patch = event.getJSONObject("patch");
                        if (patch.has("room") || patch.has("place") || patch.has("note")) {
                            lesson.remove("thumbnail");
                            lesson.remove("mapUrl");
                            if (patch.has("room")) {
                                lesson.remove("place");
                            }
                            if (patch.has("place")) {
                                lesson.remove("room");
                            }
                        }
                        java.util.Iterator<String> keys = patch.keys();
                        while (keys.hasNext()) {
                            String key = keys.next();
                            lesson.put(key, patch.get(key));
                        }
                        lesson.put("permanentId", event.getString("id"));
                    }
                }
            }
            result.put(lesson);
        }
        return result;
    }

    private static boolean includes(JSONArray values, Object value) {
        if (values == null) {
            return true;
        }
        for (int i = 0; i < values.length(); i++) {
            if (value.equals(values.opt(i))) {
                return true;
            }
        }
        return false;
    }

    private static boolean eligible(JSONObject lesson, int subgroup, String group) {
        return (!lesson.has("subgroup") || lesson.optInt("subgroup") == subgroup)
            && (!lesson.has("group") || lesson.optString("group").equals(group));
    }

    static List<JSONObject> lessons(JSONObject data, LocalDate date, int subgroup) throws Exception {
        return lessons(data, date, subgroup, data.getJSONObject("schedule").optString("group", "default"));
    }

    static List<JSONObject> lessons(JSONObject data, LocalDate date, int subgroup, String group) throws Exception {
        JSONObject schedule = data.getJSONObject("schedule");
        int cycle = week(date, LocalDate.parse(schedule.getString("anchor")));
        List<JSONObject> result = new ArrayList<>();
        JSONArray lessons = permanent(schedule, date);
        java.util.Map<String, JSONObject> originals = new java.util.HashMap<>();
        for (int i = 0; i < lessons.length(); i++) {
            JSONObject lesson = lessons.getJSONObject(i);
            originals.put(lesson.optString("id"), lesson);
            if (lesson.getInt("day") == date.getDayOfWeek().getValue() - 1
                && includes(lesson.getJSONArray("weeks"), cycle) && eligible(lesson, subgroup, group)) {
                result.add(new JSONObject(lesson.toString()));
            }
        }
        JSONArray events = schedule.optJSONArray("exceptions");
        java.util.Set<String> superseded = new java.util.HashSet<>();
        if (events != null) {
            for (int i = 0; i < events.length(); i++) {
                JSONArray ids = events.getJSONObject(i).optJSONArray("supersedes");
                if (ids != null) {
                    for (int j = 0; j < ids.length(); j++) {
                        superseded.add(ids.getString(j));
                    }
                }
            }
            for (int i = 0; i < events.length(); i++) {
                JSONObject event = events.getJSONObject(i);
                if (superseded.contains(event.getString("id")) || event.optString("action").equals("revoke")
                    || !includes(event.optJSONArray("groups"), group) || !includes(event.optJSONArray("subgroups"), subgroup)) {
                    continue;
                }
                JSONObject source = event.optJSONObject("source");
                JSONObject original = source == null ? null : originals.get(source.optString("lessonId"));
                if (original != null && !eligible(original, subgroup, group)) {
                    continue;
                }
                if (source != null && source.optString("date").equals(date.toString())) {
                    result.removeIf(lesson -> lesson.optString("id").equals(source.optString("lessonId")));
                }
                JSONObject target = event.optJSONObject("target");
                if (target != null && target.optString("date").equals(date.toString())) {
                    JSONObject lesson = original == null ? new JSONObject() : new JSONObject(original.toString());
                    JSONObject patch = target.getJSONObject("lesson");
                    if (patch.has("room") || patch.has("place") || patch.has("note")) {
                        lesson.remove("thumbnail");
                        lesson.remove("mapUrl");
                        if (patch.has("room")) {
                            lesson.remove("place");
                        }
                        if (patch.has("place")) {
                            lesson.remove("room");
                        }
                    }
                    java.util.Iterator<String> keys = patch.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        lesson.put(key, patch.get(key));
                    }
                    lesson.put("id", original == null ? event.getString("id") : original.optString("id"));
                    lesson.put("exceptionId", event.getString("id"));
                    if (eligible(lesson, subgroup, group)) {
                        result.add(lesson);
                    }
                }
            }
        }
        result.sort(Comparator.comparing(lesson -> {
            try {
                JSONArray time = time(schedule, lesson);
                return time == null ? "99:99" : time.getString(0);
            } catch (Exception ignored) {
                return "99:99";
            }
        }));
        return result;
    }

    static JSONObject next(JSONObject data, ZonedDateTime now, int subgroup) throws Exception {
        return next(data, now, subgroup, data.getJSONObject("schedule").optString("group", "default"));
    }

    static JSONObject next(JSONObject data, ZonedDateTime now, int subgroup, String group) throws Exception {
        JSONObject schedule = data.getJSONObject("schedule");
        for (int day = 0; day < 15; day++) {
            LocalDate date = now.toLocalDate().plusDays(day);
            for (JSONObject lesson : lessons(data, date, subgroup, group)) {
                if (lesson.optBoolean("onlineCourse")) {
                    continue;
                }
                JSONArray time = time(schedule, lesson);
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

    static String group(Context context) {
        return context.getSharedPreferences("study", 0).getString("academic-group", "default");
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
