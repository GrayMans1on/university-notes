package ru.graymansion.study;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

final class AppUpdater {
    private static final AtomicBoolean BUSY = new AtomicBoolean();
    static volatile String status = "Проверка версии приложения через Wi-Fi";
    static volatile boolean ready;

    private static void announce(String message) {
        status = message;
        Runnable listener = Updater.listener;
        if (listener != null) {
            listener.run();
        }
    }

    static void start(Context context, boolean force) {
        start(context, force, null);
    }

    static void start(Context context, boolean force, Runnable completed) {
        Context app = context.getApplicationContext();
        if (!BUSY.compareAndSet(false, true)) {
            if (completed != null) {
                Updater.EXECUTOR.execute(completed);
            }
            return;
        }
        Updater.EXECUTOR.execute(() -> {
            File stage = new File(app.getCacheDir(), "updates/downloading.apk");
            try {
                ready = false;
                File apk = new File(app.getCacheDir(), "updates/app.apk");
                String cached = app.getSharedPreferences("study", 0).getString("apk-manifest", "");
                if (apk.isFile() && !cached.isEmpty()) {
                    JSONObject manifest = new JSONObject(cached);
                    if (compatible(app, apk, manifest)) {
                        ready = true;
                        announce("Версия " + manifest.getString("versionName") + " загружена · готова к установке");
                        return;
                    }
                }
                Network network = Updater.wifi(app);
                if (network == null) {
                    announce("Обновление приложения ожидает Wi-Fi");
                    return;
                }
                long checked = app.getSharedPreferences("study", 0).getLong("apk-checked", 0);
                if (!force && System.currentTimeMillis() - checked < 6 * 60 * 60 * 1000L) {
                    return;
                }
                announce("Проверка новой версии приложения…");
                JSONObject manifest;
                try {
                    byte[] bytes = Updater.download(app, network, "app-release.json", 16384);
                    manifest = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                } catch (Exception error) {
                    announce("Подписанное обновление приложения пока не опубликовано");
                    return;
                }
                app.getSharedPreferences("study", 0).edit().putLong("apk-checked", System.currentTimeMillis()).apply();
                if (!validManifest(manifest, app.getPackageName())) {
                    throw new java.io.IOException("Invalid app manifest");
                }
                if (manifest.getInt("versionCode") <= app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionCode) {
                    announce("Версия приложения актуальна");
                    return;
                }
                if (!stage.getParentFile().isDirectory() && !stage.getParentFile().mkdirs()) {
                    throw new java.io.IOException("Cannot create APK staging directory");
                }
                announce("Загрузка версии " + manifest.getString("versionName") + " через Wi-Fi…");
                download(app, network, stage, manifest.getLong("size"));
                if (!compatible(app, stage, manifest)) {
                    throw new java.io.IOException("APK checksum, package or signer mismatch");
                }
                java.nio.file.Files.move(stage.toPath(), apk.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                if (!app.getSharedPreferences("study", 0).edit().putString("apk-manifest", manifest.toString()).commit()) {
                    throw new java.io.IOException("Cannot persist APK metadata");
                }
                ready = true;
                announce("Версия " + manifest.getString("versionName") + " загружена · готова к установке");
            } catch (Exception error) {
                app.getSharedPreferences("study", 0).edit().putLong("apk-checked", 0).apply();
                announce("Обновление приложения не завершено · установленная версия сохранена");
            } finally {
                stage.delete();
                BUSY.set(false);
                if (completed != null) {
                    completed.run();
                }
            }
        });
    }

    static boolean validManifest(JSONObject manifest, String packageName) {
        long size = manifest.optLong("size", -1);
        return manifest.optInt("schema") == 1 && packageName.equals(manifest.optString("packageName"))
            && manifest.optInt("versionCode") > 0 && !manifest.optString("versionName").isEmpty()
            && size > 0 && size <= 64 * 1024 * 1024 && manifest.optString("sha256").matches("[a-f0-9]{64}");
    }

    private static boolean compatible(Context context, File apk, JSONObject manifest) throws Exception {
        if (!validManifest(manifest, context.getPackageName()) || apk.length() != manifest.getLong("size")
            || !sha256(apk).equals(manifest.getString("sha256"))) {
            return false;
        }
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo current = context.getPackageManager().getPackageInfo(context.getPackageName(), flags);
        PackageInfo archive = context.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (archive == null || !current.packageName.equals(archive.packageName)
            || archive.versionCode != manifest.getInt("versionCode") || archive.versionCode <= current.versionCode) {
            return false;
        }
        Signature[] installed = Build.VERSION.SDK_INT >= 28 ? current.signingInfo.getApkContentsSigners() : current.signatures;
        Signature[] candidate = Build.VERSION.SDK_INT >= 28 && archive.signingInfo != null
            ? archive.signingInfo.getApkContentsSigners() : archive.signatures;
        return installed != null && candidate != null && installed.length > 0 && Arrays.equals(installed, candidate);
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[32768];
            int size;
            while ((size = input.read(buffer)) != -1) {
                digest.update(buffer, 0, size);
            }
        }
        StringBuilder value = new StringBuilder();
        for (byte item : digest.digest()) {
            value.append(String.format(java.util.Locale.ROOT, "%02x", item & 255));
        }
        return value.toString();
    }

    private static void download(Context context, Network network, File target, long limit) throws Exception {
        if (!network.equals(Updater.wifi(context))) {
            throw new java.io.IOException("Wi-Fi required");
        }
        HttpURLConnection connection = (HttpURLConnection) network.openConnection(new URL(ContentStore.REMOTE + "app.apk"));
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        try {
            if (connection.getResponseCode() != 200) {
                throw new java.io.IOException("APK unavailable");
            }
            long total = 0;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[32768];
                int size;
                while ((size = input.read(buffer)) != -1) {
                    total += size;
                    if (!network.equals(Updater.wifi(context)) || total > limit) {
                        throw new java.io.IOException("APK transfer interrupted");
                    }
                    output.write(buffer, 0, size);
                }
                if (total != limit) {
                    throw new java.io.IOException("APK size mismatch");
                }
            }
        } finally {
            connection.disconnect();
        }
    }

    static void install(Activity activity) {
        Updater.EXECUTOR.execute(() -> {
            try {
                File apk = new File(activity.getCacheDir(), "updates/app.apk");
                JSONObject manifest = new JSONObject(activity.getSharedPreferences("study", 0).getString("apk-manifest", ""));
                if (!compatible(activity, apk, manifest)) {
                    throw new java.io.IOException("Invalid install candidate");
                }
                activity.runOnUiThread(() -> {
                    if (!activity.getPackageManager().canRequestPackageInstalls()) {
                        activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + activity.getPackageName())));
                        Toast.makeText(activity, "Разрешите установку и повторно нажмите «Установить»", Toast.LENGTH_LONG).show();
                        return;
                    }
                    Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(ApkProvider.uri(activity),
                        "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        activity.startActivity(intent);
                    } catch (Exception ignored) {
                        Toast.makeText(activity, "Системный установщик недоступен", Toast.LENGTH_LONG).show();
                    }
                });
            } catch (Exception error) {
                ready = false;
                announce("APK не прошёл проверку · выполните проверку обновлений");
            }
        });
    }
}
