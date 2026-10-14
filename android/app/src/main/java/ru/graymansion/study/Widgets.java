package ru.graymansion.study;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;
import java.io.InputStream;
import java.time.ZonedDateTime;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

final class Widgets {
    static PendingIntent open(Context context, String route, int id) {
        Intent intent = new Intent(context, MainActivity.class).setAction("open:" + id)
            .putExtra("route", route).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ZonedDateTime now = ZonedDateTime.now(Schedule.ZONE);
        try {
            JSONObject data = ContentStore.data(context);
            List<JSONObject> today = Schedule.lessons(data, now.toLocalDate(), Schedule.subgroup(context), Schedule.group(context));
            for (int id : manager.getAppWidgetIds(new ComponentName(context, ScheduleWidget.class))) {
                RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_schedule);
                views.setTextViewText(R.id.widget_title, "Сегодня · " + now.format(
                    DateTimeFormatter.ofPattern("d MMMM", new Locale("ru"))));
                Intent adapter = new Intent(context, ScheduleRows.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
                adapter.setData(android.net.Uri.parse("study-widget://schedule/" + id));
                views.setRemoteAdapter(R.id.widget_list, adapter);
                Intent launch = new Intent(context, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent template = PendingIntent.getActivity(context, id * 100, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
                views.setPendingIntentTemplate(R.id.widget_list, template);
                int height = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 70);
                views.setViewVisibility(R.id.widget_title, height < 80 ? View.GONE : View.VISIBLE);
                WidgetTimeline timeline = WidgetTimeline.build(data, now.toLocalDate(), Schedule.subgroup(context), Schedule.group(context),
                    now.getHour() * 60 + now.getMinute(), WidgetTimeline.viewport(height));
                views.setScrollPosition(R.id.widget_list, timeline.scroll);
                views.setOnClickPendingIntent(R.id.widget_root, open(context, "/#schedule", id));
                manager.updateAppWidget(id, views);
                manager.notifyAppWidgetViewDataChanged(id, R.id.widget_list);
            }
            JSONObject next = Schedule.next(data, now, Schedule.subgroup(context), Schedule.group(context));
            for (int id : manager.getAppWidgetIds(new ComponentName(context, NextWidget.class))) {
                RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_next);
                views.setTextViewText(R.id.widget_title, next != null && next.optBoolean("ongoing") ? "Сейчас идёт" : "Ближайшая пара");
                views.setTextViewText(R.id.widget_details, next == null ? "Пар в расписании нет"
                    : next.optString("title"));
                views.setTextViewText(R.id.widget_meta, next == null ? "" : Schedule.room(next) + " · " + next.optString("start"));
                if (next != null && !next.optString("date").equals(now.toLocalDate().toString())) {
                    views.setTextViewText(R.id.widget_title, "Ближайшая · " + LocalDate.parse(next.optString("date"))
                        .format(DateTimeFormatter.ofPattern("d MMM", new Locale("ru"))));
                }
                views.setViewVisibility(R.id.widget_map, View.GONE);
                if (next != null && next.has("thumbnail")) {
                    try (InputStream input = thumbnail(context, next.getString("thumbnail").replace(".png", "-dark.png"))) {
                        Bitmap image = BitmapFactory.decodeStream(input);
                        if (image != null) {
                            views.setImageViewBitmap(R.id.widget_map, image);
                            views.setViewVisibility(R.id.widget_map, View.VISIBLE);
                        }
                    }
                }
                views.setOnClickPendingIntent(R.id.widget_root, open(context,
                    next == null ? "/#schedule" : next.optString("mapUrl", "/#schedule"), id));
                manager.updateAppWidget(id, views);
            }
        } catch (Exception ignored) {
            // The packaged dataset remains available if an update is incomplete.
        }
        scheduleRefresh(context, now);
    }

    private static InputStream thumbnail(Context context, String path) throws java.io.IOException {
        try {
            return ContentStore.open(context, ContentStore.active(context), path);
        } catch (java.io.IOException missing) {
            return ContentStore.open(context, null, path);
        }
    }

    private static void scheduleRefresh(Context context, ZonedDateTime now) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager.getAppWidgetIds(new ComponentName(context, ScheduleWidget.class)).length == 0
            && manager.getAppWidgetIds(new ComponentName(context, NextWidget.class)).length == 0) {
            return;
        }
        PendingIntent pending = PendingIntent.getBroadcast(context, 200, new Intent(context, RefreshReceiver.class).setAction(RefreshReceiver.REFRESH),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long next = now.plusMinutes(15).withSecond(0).toInstant().toEpochMilli();
        context.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC, next, pending);
    }
}
