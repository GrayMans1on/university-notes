package ru.graymansion.study;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class ContentStoreTest {
    @Test
    public void nativeUpgradeUsesPackagedInterfaceWithoutReplacingCompatibleDownloads() throws Exception {
        JSONObject bundle = new JSONObject().put("minAppVersion", 5);
        assertTrue(ContentStore.preferBundled(new JSONObject(), bundle));
        assertTrue(ContentStore.preferBundled(new JSONObject().put("minAppVersion", 4), bundle));
        assertFalse(ContentStore.preferBundled(new JSONObject().put("minAppVersion", 5), bundle));
        assertFalse(ContentStore.preferBundled(new JSONObject().put("minAppVersion", 6), bundle));
    }
}
