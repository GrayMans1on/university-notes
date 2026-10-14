package ru.graymansion.study;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;

public final class SyncJob extends JobService {
    static void schedule(Context context) {
        if (context.getSystemService(JobScheduler.class).getPendingJob(101) != null) {
            return;
        }
        JobInfo.Builder builder = new JobInfo.Builder(101, new ComponentName(context, SyncJob.class))
            .setPeriodic(60 * 60 * 1000L).setPersisted(true);
        if (Build.VERSION.SDK_INT >= 28) {
            builder.setRequiredNetwork(new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build());
        } else {
            builder.setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY);
        }
        context.getSystemService(JobScheduler.class).schedule(builder.build());
    }

    @Override
    public boolean onStartJob(JobParameters parameters) {
        Updater.start(this, () -> AppUpdater.start(this, false, () -> jobFinished(parameters, false)));
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters parameters) {
        return true;
    }
}
