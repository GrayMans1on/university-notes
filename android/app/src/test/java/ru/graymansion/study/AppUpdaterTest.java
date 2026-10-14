package ru.graymansion.study;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class AppUpdaterTest {
    private JSONObject manifest() throws Exception {
        return new JSONObject().put("schema", 1).put("packageName", "ru.graymansion.study")
            .put("versionCode", 3).put("versionName", "1.0.2").put("size", 15000000)
            .put("sha256", "a".repeat(64));
    }

    @Test
    public void rejectsWrongPackageHashAndUnboundedDownloads() throws Exception {
        assertTrue(AppUpdater.validManifest(manifest(), "ru.graymansion.study"));
        assertFalse(AppUpdater.validManifest(manifest(), "other.package"));
        assertFalse(AppUpdater.validManifest(manifest().put("size", 0), "ru.graymansion.study"));
        assertFalse(AppUpdater.validManifest(manifest().put("size", 67108865), "ru.graymansion.study"));
        assertFalse(AppUpdater.validManifest(manifest().put("sha256", "../app.apk"), "ru.graymansion.study"));
        assertFalse(AppUpdater.validManifest(manifest().put("schema", 2), "ru.graymansion.study"));
        assertFalse(AppUpdater.validManifest(manifest().put("versionCode", -1), "ru.graymansion.study"));
    }
}
