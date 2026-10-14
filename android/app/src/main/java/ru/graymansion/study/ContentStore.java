package ru.graymansion.study;

import android.content.Context;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

final class ContentStore {
    static final String ORIGIN = "https://study.local";
    static final String REMOTE = "https://graymans1on.github.io/university-notes/android/";

    static File active(Context context) {
        String version = context.getSharedPreferences("study", 0).getString("active", "");
        if (!version.matches("[a-f0-9]{64}")) {
            return null;
        }
        File folder = new File(context.getFilesDir(), "content/" + version);
        return new File(folder, "index.html").isFile() ? folder : null;
    }

    static InputStream open(Context context, File folder, String path) throws IOException {
        if (!safe(path)) {
            throw new IOException("Invalid content path");
        }
        if (folder != null) {
            return new FileInputStream(new File(folder, path));
        }
        return context.getAssets().open("site/" + path);
    }

    static boolean safe(String path) {
        return !path.isEmpty() && !path.startsWith("/") && !path.contains("\\") && !path.contains("\0")
            && !java.util.Arrays.asList(path.split("/", -1)).contains("..") && path.length() < 1000;
    }

    static byte[] bytes(InputStream input) throws IOException {
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[32768];
        int size;
        while ((size = input.read(buffer)) != -1) {
            output.write(buffer, 0, size);
        }
        return output.toByteArray();
    }

    static String text(Context context, File folder, String path) throws IOException {
        try (InputStream input = open(context, folder, path)) {
            return new String(bytes(input), StandardCharsets.UTF_8);
        }
    }

    static JSONObject data(Context context) throws Exception {
        return new JSONObject(text(context, active(context), "assets/app-data.json"));
    }

    static JSONObject manifest(Context context, File folder) throws Exception {
        if (folder != null) {
            try (InputStream input = new FileInputStream(new File(folder, "bundle-manifest.json"))) {
                return new JSONObject(new String(bytes(input), StandardCharsets.UTF_8));
            }
        }
        try (InputStream input = context.getAssets().open("bundle-manifest.json")) {
            return new JSONObject(new String(bytes(input), StandardCharsets.UTF_8));
        }
    }
}
