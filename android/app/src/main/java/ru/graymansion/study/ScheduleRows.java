package ru.graymansion.study;

import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONObject;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public final class ScheduleRows extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new RemoteViewsFactory() {
            private List<JSONObject> lessons = new ArrayList<>();
            private JSONObject data;

            @Override
            public void onCreate() {
                onDataSetChanged();
            }

            @Override
            public void onDataSetChanged() {
                try {
                    data = ContentStore.data(ScheduleRows.this);
                    lessons = Schedule.lessons(data, LocalDate.now(Schedule.ZONE), Schedule.subgroup(ScheduleRows.this));
                } catch (Exception ignored) {
                    lessons = new ArrayList<>();
                }
            }

            @Override
            public void onDestroy() {
                lessons.clear();
            }

            @Override
            public int getCount() {
                return Math.max(1, lessons.size());
            }

            @Override
            public RemoteViews getViewAt(int position) {
                RemoteViews row = new RemoteViews(getPackageName(), R.layout.widget_row);
                String text = "Пар нет";
                String route = "/#schedule";
                if (position >= 0 && position < lessons.size()) {
                    JSONObject lesson = lessons.get(position);
                    try {
                        String time = lesson.optBoolean("onlineCourse") ? "Онлайн-курс"
                            : data.getJSONObject("schedule").getJSONObject("bells").getJSONArray(
                                String.valueOf(lesson.getInt("pair"))).getString(0);
                        text = time + "  " + lesson.optString("title") + " · " + Schedule.room(lesson);
                        route = lesson.optString("mapUrl", "/#schedule");
                    } catch (Exception ignored) {
                        text = lesson.optString("title");
                    }
                }
                row.setTextViewText(R.id.row_text, text);
                row.setOnClickFillInIntent(R.id.row_text, new Intent().putExtra("route", route));
                return row;
            }

            @Override
            public RemoteViews getLoadingView() {
                return null;
            }

            @Override
            public int getViewTypeCount() {
                return 1;
            }

            @Override
            public long getItemId(int position) {
                return position;
            }

            @Override
            public boolean hasStableIds() {
                return false;
            }
        };
    }
}
