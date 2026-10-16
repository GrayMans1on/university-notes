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
        JobInfo.Builder builder = new JobInfo.Builder(101, new ComponentName(context, SyncJob.class))
            .setPeriodic(60 * 60 * 1000L).setPersisted(true);
        if (Build.VERSION.SDK_INT >= 28) {
            NetworkRequest.Builder request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            String mode = NetworkPolicy.mode(context);
            if (!mode.equals("mobile")) { request.addTransportType(NetworkCapabilities.TRANSPORT_WIFI); }
            if (!mode.equals("wifi")) { request.addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR); }
            builder.setRequiredNetwork(request.build());
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
