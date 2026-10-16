package ru.graymansion.study;

import android.content.Context;
import android.net.Network;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ConcurrentHashMap;

final class Textbooks {
    private static final ConcurrentHashMap<String, String> MESSAGES = new ConcurrentHashMap<>();
    private static final java.util.Set<String> BUSY = ConcurrentHashMap.newKeySet();

    static JSONArray catalog(Context context) throws Exception {
        try (InputStream input = ContentStore.open(context, ContentStore.active(context), "assets/textbooks.json")) {
            return new JSONObject(new String(ContentStore.bytes(input), java.nio.charset.StandardCharsets.UTF_8)).getJSONArray("books");
        }
    }

    static JSONObject find(Context context, String id) throws Exception {
        JSONArray books = catalog(context);
        for (int i = 0; i < books.length(); i++) {
            JSONObject book = books.getJSONObject(i);
            if (id.equals(book.getString("id"))) {
                validate(book);
                return book;
            }
        }
        throw new java.io.IOException("Учебник не найден в каталоге");
    }

    static void validate(JSONObject book) throws Exception {
        URL url = new URL(book.getString("url"));
        if (!book.getString("id").matches("[a-z0-9-]{1,80}") || !url.getProtocol().equals("https")
            || url.getUserInfo() != null || !book.getString("sha256").matches("[a-f0-9]{64}")
            || book.getLong("size") < 5 || book.getLong("size") > 200L * 1024 * 1024) {
            throw new java.io.IOException("Некорректная запись учебника");
        }
    }

    static File file(Context context, JSONObject book) throws Exception {
        validate(book);
        return new File(context.getFilesDir(), "textbooks/" + book.getString("sha256") + ".pdf");
    }

    static String status(Context context) {
        JSONObject result = new JSONObject();
        try {
            JSONArray books = catalog(context);
            for (int i = 0; i < books.length(); i++) {
                JSONObject book = books.getJSONObject(i);
                String id = book.getString("id");
                File saved = file(context, book);
                result.put(id, new JSONObject().put("saved", saved.isFile() && saved.length() == book.getLong("size"))
                    .put("busy", BUSY.contains(id)).put("message", MESSAGES.getOrDefault(id, "")));
            }
        } catch (Exception ignored) {
            // Leave the packaged empty catalog usable before textbooks are added.
        }
        return result.toString();
    }

    static void download(Context context, String id, Runnable changed) {
        if (!BUSY.add(id)) {
            return;
        }
        MESSAGES.put(id, "Ожидание загрузки…");
        changed.run();
        Updater.EXECUTOR.execute(() -> {
            File stage = null;
            HttpURLConnection connection = null;
            try {
                JSONObject book = find(context, id);
                File target = file(context, book);
                if (target.isFile() && target.length() == book.getLong("size")) {
                    MESSAGES.put(id, "Скачан · доступен офлайн");
                    return;
                }
                Network network = NetworkPolicy.available(context);
                if (network == null) {
                    throw new java.io.IOException("Нет сети, разрешённой в настройках");
                }
                if (!target.getParentFile().isDirectory() && !target.getParentFile().mkdirs()) {
                    throw new java.io.IOException("Нет места для учебника");
                }
                stage = new File(target.getParentFile(), target.getName() + ".part");
                URL url = new URL(book.getString("url"));
                for (int redirects = 0; redirects <= 5; redirects++) {
                    if (!url.getProtocol().equals("https") || url.getUserInfo() != null) {
                        throw new java.io.IOException("Для учебника требуется HTTPS");
                    }
                    connection = (HttpURLConnection) network.openConnection(url);
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(15000);
                    connection.setReadTimeout(20000);
                    int code = connection.getResponseCode();
                    if (code == 200) { break; }
                    if (code < 300 || code > 399 || redirects == 5 || connection.getHeaderField("Location") == null) {
                        throw new java.io.IOException("Файл учебника недоступен");
                    }
                    url = new URL(url, connection.getHeaderField("Location"));
                    connection.disconnect();
                }
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long total = 0;
                long reported = 0;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(stage)) {
                    byte[] buffer = new byte[32768];
                    int size;
                    while ((size = input.read(buffer)) != -1) {
                        total += size;
                        if (!NetworkPolicy.permitted(context, network) || total > book.getLong("size")) {
                            throw new java.io.IOException("Загрузка прервана: сеть или размер файла изменились");
                        }
                        output.write(buffer, 0, size);
                        digest.update(buffer, 0, size);
                        if (total - reported >= 1024 * 1024) {
                            reported = total;
                            MESSAGES.put(id, "Загрузка: " + total * 100 / book.getLong("size") + "%");
                            changed.run();
                        }
                    }
                }
                String hash = String.format(java.util.Locale.ROOT, "%064x", new java.math.BigInteger(1, digest.digest()));
                if (total != book.getLong("size") || !hash.equals(book.getString("sha256"))) {
                    throw new java.io.IOException("Контрольная сумма PDF не совпала");
                }
                try (InputStream input = new FileInputStream(stage)) {
                    byte[] header = new byte[5];
                    if (input.read(header) != 5 || !new String(header, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-")) {
                        throw new java.io.IOException("Файл не является PDF");
                    }
                }
                if (!stage.renameTo(target)) {
                    throw new java.io.IOException("Не удалось сохранить учебник");
                }
                MESSAGES.put(id, "Скачан · доступен офлайн");
            } catch (Exception error) {
                MESSAGES.put(id, error.getMessage() == null ? "Учебник не загружен" : error.getMessage());
            } finally {
                if (connection != null) { connection.disconnect(); }
                if (stage != null && stage.exists()) { stage.delete(); }
                BUSY.remove(id);
                changed.run();
            }
        });
    }
}
