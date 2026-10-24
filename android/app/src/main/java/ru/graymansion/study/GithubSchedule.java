package ru.graymansion.study;

import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Set;

final class GithubSchedule {
    private static final Set<String> PATHS = new java.util.HashSet<>(java.util.Arrays.asList("content/schedule.json",
        "content/schedule-exceptions.json", "content/schedule-overrides.json", "content/announcements.json", "content/teachers.json"));

    static boolean allowed(String method, String path) {
        return PATHS.contains(path) && (method.equals("GET")
            || method.equals("PUT") && !path.equals("content/schedule.json"));
    }

    static JSONObject request(android.content.Context context, String method, String path, String token, String body) {
        JSONObject result = new JSONObject();
        HttpURLConnection connection = null;
        try {
            if (!allowed(method, path) || token.length() > 500 || body.length() > 2 * 1024 * 1024) {
                return result.put("status", 400).put("body", "Invalid schedule request");
            }
            URL url = new URL("https://api.github.com/repos/GrayMans1on/university-notes/contents/" + path
                + (method.equals("GET") ? "?ref=main" : ""));
            android.net.Network network = NetworkPolicy.available(context);
            if (network == null) {
                return result.put("status", 503).put("body", "Нет сети, разрешённой в настройках приложения");
            }
            connection = (HttpURLConnection) network.openConnection(url);
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            connection.setRequestProperty("User-Agent", "UniversityNotes-Android");
            if (!token.isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + token);
            }
            if (method.equals("PUT")) {
                JSONObject payload = new JSONObject(body);
                if (!payload.optString("branch").equals("main") || !payload.has("sha") || !payload.has("content")) {
                    return result.put("status", 400).put("body", "Invalid schedule payload");
                }
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(bytes);
                }
            }
            int status = connection.getResponseCode();
            InputStream stream = status < 400 ? connection.getInputStream() : connection.getErrorStream();
            String response = "";
            if (stream != null) {
                try (InputStream input = stream; java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                    byte[] buffer = new byte[16384];
                    int size;
                    while ((size = input.read(buffer)) != -1) {
                        if (!NetworkPolicy.permitted(context, network)) {
                            throw new java.io.IOException("Allowed network disconnected");
                        }
                        if (output.size() + size > 4 * 1024 * 1024) {
                            throw new java.io.IOException("Schedule response too large");
                        }
                        output.write(buffer, 0, size);
                    }
                    response = output.toString(StandardCharsets.UTF_8.name());
                }
            }
            result.put("status", status).put("body", response);
        } catch (Exception ignored) {
            try {
                result.put("status", 503).put("body", "GitHub connection unavailable");
            } catch (Exception ignoredResult) {
                // Keep tokens and request bodies out of error messages.
            }
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
        return result;
    }
}
