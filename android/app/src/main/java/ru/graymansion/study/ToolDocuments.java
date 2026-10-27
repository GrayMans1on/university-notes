package ru.graymansion.study;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Set;

final class ToolDocuments {
    private static final Set<String> TYPES = new java.util.HashSet<>(java.util.Arrays.asList(
        "application/json", "image/svg+xml", "image/png", "text/plain", "text/x-python", "text/x-csharp"));

    static byte[] decode(String name, String mime, String data) {
        if (name == null || !name.matches("[\\p{L}\\p{N} _.-]{1,100}") || name.contains("..")
            || !TYPES.contains(mime) || data == null || data.length() > 2800000) {
            throw new IllegalArgumentException("Недопустимый файл экспорта");
        }
        byte[] bytes;
        if (mime.equals("image/png")) {
            String prefix = "data:image/png;base64,";
            if (!data.startsWith(prefix)) {
                throw new IllegalArgumentException("Некорректное изображение PNG");
            }
            bytes = Base64.getDecoder().decode(data.substring(prefix.length()));
            byte[] signature = { (byte) 137, 80, 78, 71, 13, 10, 26, 10 };
            if (bytes.length < signature.length) {
                throw new IllegalArgumentException("Некорректное изображение PNG");
            }
            for (int i = 0; i < signature.length; i++) {
                if (bytes[i] != signature[i]) {
                    throw new IllegalArgumentException("Некорректное изображение PNG");
                }
            }
        } else {
            bytes = data.getBytes(StandardCharsets.UTF_8);
        }
        if (bytes.length > 2 * 1024 * 1024) {
            throw new IllegalArgumentException("Файл превышает 2 МБ");
        }
        return bytes;
    }
}
