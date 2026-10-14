package ru.graymansion.study;

import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

final class WidgetTimeline {
    static final int LESSON_HEIGHT = 36;

    static final class Row {
        final JSONObject lesson;
        final int gap;
        final int spacer;
        final int height;
        final String start;
        final String end;
        final boolean ongoing;

        Row(JSONObject lesson, int gap, int spacer, String start, String end, int minute) {
            this.lesson = lesson;
            this.gap = gap;
            this.spacer = spacer;
            this.start = start;
            this.end = end;
            this.height = lesson != null ? LESSON_HEIGHT : gap > 0 ? 13 + 2 * gapPadding(gap) : spacer;
            this.ongoing = lesson != null && !start.isEmpty() && minutes(start) <= minute && minute < minutes(end);
        }
    }

    final List<Row> rows = new ArrayList<>();
    int focus;
    int scroll;

    static int minutes(String value) {
        LocalTime time = LocalTime.parse(value);
        return time.getHour() * 60 + time.getMinute();
    }

    static int gapPadding(int minutes) {
        return 2 + Math.min(120, Math.max(0, minutes)) / 5;
    }

    static int viewport(int height) {
        return Math.max(LESSON_HEIGHT, height - 14 - (height >= 80 ? 16 : 0));
    }

    static WidgetTimeline build(JSONObject data, LocalDate date, int subgroup, int minute, int viewport) throws Exception {
        WidgetTimeline result = new WidgetTimeline();
        int padding = Math.max(0, (viewport - LESSON_HEIGHT) / 2);
        result.rows.add(new Row(null, 0, padding, "", "", minute));
        int previousEnd = -1;
        int selected = -1;
        int last = -1;
        JSONObject bells = data.getJSONObject("schedule").getJSONObject("bells");
        for (JSONObject lesson : Schedule.lessons(data, date, subgroup)) {
            JSONArray time = lesson.optBoolean("onlineCourse") ? null : bells.optJSONArray(String.valueOf(lesson.optInt("pair")));
            String start = time == null ? "" : time.getString(0);
            String end = time == null ? "" : time.getString(1);
            if (time != null && previousEnd >= 0 && minutes(start) > previousEnd) {
                result.rows.add(new Row(null, minutes(start) - previousEnd, 0, "", "", minute));
            }
            int index = result.rows.size();
            result.rows.add(new Row(lesson, 0, 0, start, end, minute));
            if (time != null) {
                previousEnd = minutes(end);
                last = index;
                if (selected < 0 && previousEnd > minute) {
                    selected = index;
                }
            }
        }
        if (result.rows.size() == 1) {
            result.rows.add(new Row(new JSONObject().put("title", "Сегодня пар нет"), 0, 0, "", "", minute));
        }
        result.rows.add(new Row(null, 0, padding, "", "", minute));
        result.focus = selected >= 0 ? selected : last >= 0 ? last : 1;
        int y = 0;
        for (int i = 0; i < result.focus; i++) {
            y += result.rows.get(i).height;
        }
        int bottom = y + LESSON_HEIGHT / 2 + viewport / 2;
        y = 0;
        result.scroll = result.rows.size() - 1;
        for (int i = 0; i < result.rows.size(); i++) {
            y += result.rows.get(i).height;
            if (y >= bottom) {
                result.scroll = i;
                break;
            }
        }
        return result;
    }
}
