package ru.graymansion.study;

import android.content.Context;
import android.net.Network;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class ScheduleService {
    static boolean allowed(String value) {
        try {
            URL url = new URL(value);
            return url.getProtocol().equals("https") && url.getHost().endsWith(".workers.dev") && url.getPort() == -1
                && url.getUserInfo() == null && url.getQuery() == null && url.getRef() == null && url.getPath().equals("/changes");
        } catch (Exception ignored) { return false; }
    }

    static JSONObject request(Context context, String body) {
        JSONObject result = new JSONObject();
        HttpURLConnection connection = null;
        try {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > 32768) { return result.put("status", 413).put("body", "{}"); }
            JSONObject config = new JSONObject(ContentStore.text(context, ContentStore.active(context), "assets/schedule-service.json"));
            String endpoint = config.optString("url");
            if (config.optInt("schema") != 1 || !allowed(endpoint)) {
                return result.put("status", 503).put("body", "{\"message\":\"Сервис сохранения не настроен\"}");
            }
            Network network = NetworkPolicy.available(context);
            if (network == null) {
                return result.put("status", 503).put("body", "{\"message\":\"Нет разрешённой сети. Черновик сохранён.\"}");
            }
            connection = (HttpURLConnection) network.openConnection(new URL(endpoint));
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Origin", "https://study.local");
            connection.setFixedLengthStreamingMode(bytes.length);
            connection.setDoOutput(true);
            if (!NetworkPolicy.permitted(context, network)) { throw new java.io.IOException("Network unavailable"); }
            try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            int code = connection.getResponseCode();
            InputStream stream = code < 400 ? connection.getInputStream() : connection.getErrorStream();
            String text = "{}";
            if (stream != null) {
                try (InputStream input = stream; java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                    byte[] buffer = new byte[16384];
                    int size;
                    while ((size = input.read(buffer)) != -1) {
                        if (!NetworkPolicy.permitted(context, network) || output.size() + size > 4 * 1024 * 1024) {
                            throw new java.io.IOException("Transfer interrupted");
                        }
                        output.write(buffer, 0, size);
                    }
                    text = output.toString(StandardCharsets.UTF_8.name());
                }
            }
            return result.put("status", code).put("body", text);
        } catch (Exception ignored) {
            try { result.put("status", 503).put("body", "{\"message\":\"Сервис недоступен. Черновик сохранён.\"}"); }
            catch (Exception ignoredResult) { /* Keep request bodies out of errors. */ }
            return result;
        } finally { if (connection != null) { connection.disconnect(); } }
    }
}
