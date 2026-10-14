package ru.graymansion.study;

import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONObject;
import java.time.ZonedDateTime;

public final class ScheduleRows extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        int widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0);
        return new RemoteViewsFactory() {
            private WidgetTimeline timeline = new WidgetTimeline();

            @Override
            public void onCreate() {
                onDataSetChanged();
            }

            @Override
            public void onDataSetChanged() {
                try {
                    JSONObject data = ContentStore.data(ScheduleRows.this);
                    ZonedDateTime now = ZonedDateTime.now(Schedule.ZONE);
                    int height = AppWidgetManager.getInstance(ScheduleRows.this).getAppWidgetOptions(widgetId)
                        .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 70);
                    timeline = WidgetTimeline.build(data, now.toLocalDate(), Schedule.subgroup(ScheduleRows.this), Schedule.group(ScheduleRows.this),
                        now.getHour() * 60 + now.getMinute(), WidgetTimeline.viewport(height));
                } catch (Exception ignored) {
                    timeline = new WidgetTimeline();
                }
            }

            @Override
            public void onDestroy() {
                timeline.rows.clear();
            }

            @Override
            public int getCount() {
                return timeline.rows.size();
            }

            private int pixels(int dp) {
                return Math.round(dp * getResources().getDisplayMetrics().density);
            }

            @Override
            public RemoteViews getViewAt(int position) {
                if (position < 0 || position >= timeline.rows.size()) {
                    return null;
                }
                WidgetTimeline.Row item = timeline.rows.get(position);
                if (item.lesson == null) {
                    if (item.gap > 0) {
                        RemoteViews gap = new RemoteViews(getPackageName(), R.layout.widget_gap);
                        gap.setTextViewText(R.id.gap_text, item.gap + " мин");
                        int padding = pixels(WidgetTimeline.gapPadding(item.gap));
                        gap.setViewPadding(R.id.gap_text, 0, padding, 0, padding);
                        gap.setOnClickFillInIntent(R.id.gap_text, new Intent().putExtra("route", "/#schedule"));
                        return gap;
                    }
                    RemoteViews spacer = new RemoteViews(getPackageName(), R.layout.widget_spacer);
                    spacer.setViewPadding(R.id.spacer, 0, pixels(item.spacer), 0, 0);
                    return spacer;
                }
                JSONObject lesson = item.lesson;
                boolean lecture = "Лекция".equals(lesson.optString("kind"));
                boolean practice = "Практика".equals(lesson.optString("kind"));
                String ink = lecture ? "#B2CAF5" : practice ? "#A0D4BF" : "#D0B9EE";
                String background = lecture ? "#1C2B44" : practice ? "#1A302B" : "#2C2440";
                String accent = lecture ? "#89A8E8" : practice ? "#80BAA5" : "#B39BD5";
                RemoteViews row = new RemoteViews(getPackageName(), R.layout.widget_row);
                row.setTextViewText(R.id.row_start, item.start.isEmpty() ? "—" : item.start);
                row.setTextViewText(R.id.row_end, item.end);
                row.setTextViewText(R.id.row_text, lesson.optString("title"));
                String meta = lesson.optString("kind", lesson.optBoolean("onlineCourse") ? "Онлайн-курс" : "");
                if (lesson.has("room") || lesson.has("place")) {
                    meta += " · " + Schedule.room(lesson);
                }
                row.setTextViewText(R.id.row_meta, (item.ongoing ? "Сейчас · " : "") + meta);
                row.setTextColor(R.id.row_start, Color.parseColor(ink));
                row.setTextColor(R.id.row_meta, Color.parseColor(ink));
                row.setTextColor(R.id.row_text, Color.parseColor(ink));
                row.setInt(R.id.row_root, "setBackgroundColor", Color.parseColor(background));
                row.setInt(R.id.row_color, "setBackgroundColor", Color.parseColor(item.ongoing ? "#FFFFFF" : accent));
                row.setOnClickFillInIntent(R.id.row_root, new Intent().putExtra("route", lesson.optString("mapUrl", "/#schedule")));
                return row;
            }

            @Override
            public RemoteViews getLoadingView() {
                return null;
            }

            @Override
            public int getViewTypeCount() {
                return 3;
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
