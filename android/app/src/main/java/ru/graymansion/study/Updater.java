package ru.graymansion.study;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

final class Updater {
    static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean BUSY = new AtomicBoolean();
    static volatile String status = "Материалы доступны офлайн";
    static volatile Runnable listener;

    static Network wifi(Context context) {
        ConnectivityManager manager = context.getSystemService(ConnectivityManager.class);
        Network network = manager.getActiveNetwork();
        NetworkCapabilities caps = manager.getNetworkCapabilities(network);
        return caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
            && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ? network : null;
    }

    static void announce(String value) {
        status = value;
        Runnable current = listener;
        if (current != null) {
            current.run();
        }
    }

    static void start(Context context, Runnable completed) {
        Context app = context.getApplicationContext();
        if (!BUSY.compareAndSet(false, true)) {
            if (completed != null) {
                completed.run();
            }
            return;
        }
        EXECUTOR.execute(() -> {
            File stage = null;
            try {
                Network network = wifi(app);
                if (network == null) {
                    announce("Офлайн · обновление при подключении к Wi-Fi");
                    return;
                }
                announce("Проверка обновлений через Wi-Fi…");
                byte[] manifestBytes = download(app, network, "manifest.json", 2 * 1024 * 1024);
                JSONObject manifest = new JSONObject(new String(manifestBytes, StandardCharsets.UTF_8));
                if (manifest.getInt("schema") != 1) {
                    throw new IOException("Unsupported update format");
                }
                if (manifest.optInt("minAppVersion", 1) > app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionCode) {
                    announce("Для новых материалов требуется обновить APK");
                    return;
                }
                String version = manifest.getString("version");
                if (!version.matches("[a-f0-9]{64}")) {
                    throw new IOException("Invalid version");
                }
                File previous = ContentStore.active(app);
                JSONObject old = ContentStore.manifest(app, previous);
                if (version.equals(old.optString("version"))) {
                    checked(app);
                    announce("Материалы актуальны · только Wi-Fi");
                    return;
                }
                JSONObject files = manifest.getJSONObject("files");
                JSONObject oldFiles = old.getJSONObject("files");
                if (files.length() > 5000 || !files.has("index.html") || !files.has("assets/app-data.json")) {
                    throw new IOException("Incomplete update");
                }
                stage = new File(app.getFilesDir(), "content/staging");
                remove(stage);
                if (!stage.mkdirs()) {
                    throw new IOException("Cannot create staging directory");
                }
                long total = 0;
                int count = 0;
                Iterator<String> names = files.keys();
                while (names.hasNext()) {
                    String path = names.next();
                    JSONObject record = files.getJSONObject(path);
                    int size = record.getInt("size");
                    String hash = record.getString("sha256");
                    total += size;
                    if (!ContentStore.safe(path) || size < 0 || size > 16 * 1024 * 1024
                        || total > 128 * 1024 * 1024 || !hash.matches("[a-f0-9]{64}")) {
                        throw new IOException("Invalid update file");
                    }
                    if (wifi(app) == null) {
                        throw new IOException("Wi-Fi disconnected");
                    }
                    File target = new File(stage, path);
                    File parent = target.getParentFile();
                    if (!parent.isDirectory() && !parent.mkdirs()) {
                        throw new IOException("Cannot create content directory");
                    }
                    JSONObject oldFile = oldFiles.optJSONObject(path);
                    if (oldFile != null && hash.equals(oldFile.optString("sha256"))) {
                        try (InputStream input = ContentStore.open(app, previous, path);
                             FileOutputStream output = new FileOutputStream(target)) {
                            output.write(ContentStore.bytes(input));
                        }
                    } else {
                        byte[] bytes = download(app, network, "content/" + path, size + 1);
                        Files.write(target.toPath(), bytes);
                    }
                    if (target.length() != size || !hash.equals(hash(Files.readAllBytes(target.toPath())))) {
                        throw new IOException("Content checksum mismatch");
                    }
                    count++;
                    if (count % 25 == 0) {
                        announce("Обновление материалов: " + count + "/" + files.length());
                    }
                }
                Files.write(new File(stage, "bundle-manifest.json").toPath(), manifestBytes);
                File destination = new File(app.getFilesDir(), "content/" + version);
                if (!destination.exists() && !stage.renameTo(destination)) {
                    throw new IOException("Cannot activate update");
                }
                if (!app.getSharedPreferences("study", 0).edit().putString("active", version).commit()) {
                    throw new IOException("Cannot persist active version");
                }
                checked(app);
                announce("Загружены новые материалы · нажмите «Применить»");
                Widgets.refresh(app);
            } catch (Exception error) {
                announce(wifi(app) == null ? "Офлайн · обновление продолжится через Wi-Fi"
                    : "Обновление не завершено. Сохранённые материалы доступны");
            } finally {
                if (stage != null && stage.exists()) {
                    remove(stage);
                }
                BUSY.set(false);
                if (completed != null) {
                    completed.run();
                }
            }
        });
    }

    private static void checked(Context context) {
        context.getSharedPreferences("study", 0).edit().putLong("checked", System.currentTimeMillis()).apply();
    }

    private static byte[] download(Context context, Network network, String path, int limit) throws Exception {
        if (wifi(context) == null || !network.equals(wifi(context))) {
            throw new IOException("Wi-Fi required");
        }
        URL url = new URL(ContentStore.REMOTE + path);
        HttpURLConnection connection = (HttpURLConnection) network.openConnection(url);
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("Cache-Control", "no-cache");
        try {
            if (connection.getResponseCode() != 200) {
                throw new IOException("Update unavailable");
            }
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[32768];
                int size;
                while ((size = input.read(buffer)) != -1) {
                    if (!network.equals(wifi(context)) || output.size() + size > limit) {
                        throw new IOException("Transfer interrupted");
                    }
                    output.write(buffer, 0, size);
                }
                return output.toByteArray();
            }
        } finally {
            connection.disconnect();
        }
    }

    static String hash(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder text = new StringBuilder();
        for (byte value : digest) {
            text.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        }
        return text.toString();
    }

    static void remove(File path) {
        File[] children = path.listFiles();
        if (children != null) {
            for (File child : children) {
                remove(child);
            }
        }
        path.delete();
    }
}
