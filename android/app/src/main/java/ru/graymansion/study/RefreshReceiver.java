package ru.graymansion.study;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class RefreshReceiver extends BroadcastReceiver {
    static final String REFRESH = "ru.graymansion.study.REFRESH_WIDGETS";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!REFRESH.equals(action) && !Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !Intent.ACTION_TIME_CHANGED.equals(action) && !Intent.ACTION_TIMEZONE_CHANGED.equals(action)
            && !Intent.ACTION_DATE_CHANGED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        Widgets.refresh(context);
        SyncJob.schedule(context);
    }
}
