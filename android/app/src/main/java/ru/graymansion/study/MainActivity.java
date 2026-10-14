package ru.graymansion.study;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.graphics.Insets;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.print.PrintManager;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLConnection;
import java.util.Set;

public final class MainActivity extends Activity {
    private WebView web;
    private FrameLayout frame;
    private boolean darkTheme;
    private File content;
    private String downloadPath;
    private ConnectivityManager.NetworkCallback callback;
    private static final Set<String> KEYS = new java.util.HashSet<>(java.util.Arrays.asList("mobile-bookmarks", "mobile-last", "study-reading-settings"));

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(245, 247, 251));
        frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(245, 247, 251));
        frame.addView(web, new FrameLayout.LayoutParams(-1, -1));
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(Math.max(bars.left, keyboard.left), Math.max(bars.top, keyboard.top),
                    Math.max(bars.right, keyboard.right), Math.max(bars.bottom, keyboard.bottom));
                return WindowInsets.CONSUMED;
            }
            view.setPadding(Math.max(insets.getStableInsetLeft(), insets.getSystemWindowInsetLeft()),
                Math.max(insets.getStableInsetTop(), insets.getSystemWindowInsetTop()),
                Math.max(insets.getStableInsetRight(), insets.getSystemWindowInsetRight()),
                Math.max(insets.getStableInsetBottom(), insets.getSystemWindowInsetBottom()));
            return insets.consumeSystemWindowInsets();
        });
        setContentView(frame);
        showSystemBars();
        frame.requestApplyInsets();
        content = ContentStore.active(this);
        File pinned = content;
        Updater.EXECUTOR.execute(() -> {
            File root = new File(getFilesDir(), "content");
            File[] versions = root.listFiles();
            File active = ContentStore.active(this);
            if (versions != null) {
                for (File version : versions) {
                    if (version.getName().matches("[a-f0-9]{64}") && !version.equals(pinned) && !version.equals(active)) {
                        Updater.remove(version);
                    }
                }
            }
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        web.addJavascriptInterface(new Bridge(), "StudyNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                try {
                    if (!"https".equals(uri.getScheme()) || !"study.local".equals(uri.getHost()) || uri.getPort() != -1) {
                        return denied();
                    }
                    String path = uri.getPath();
                    if (path == null) {
                        return denied();
                    }
                    path = path.substring(1);
                    if (path.isEmpty() || path.endsWith("/")) {
                        path += "index.html";
                    }
                    String mime = path.endsWith(".js") || path.endsWith(".mjs") ? "text/javascript"
                        : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".json") ? "application/json"
                        : path.endsWith(".md") ? "text/plain" : URLConnection.guessContentTypeFromName(path);
                    WebResourceResponse response = new WebResourceResponse(mime == null ? "application/octet-stream" : mime,
                        "UTF-8", ContentStore.open(MainActivity.this, content, path));
                    response.setResponseHeaders(java.util.Collections.singletonMap("Cache-Control", "no-store"));
                    return response;
                } catch (Exception ignored) {
                    return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", java.util.Collections.emptyMap(),
                        new ByteArrayInputStream("Материал недоступен".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "study.local".equals(uri.getHost()) && uri.getPort() == -1) {
                    return false;
                }
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {
                        Toast.makeText(MainActivity.this, "Нет приложения для открытия ссылки", Toast.LENGTH_SHORT).show();
                    }
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                emitStatus();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message)
                    .setPositiveButton("Удалить", (dialog, which) -> result.confirm())
                    .setNegativeButton("Отмена", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> {
            Uri uri = Uri.parse(url);
            if (!ContentStore.ORIGIN.equals(uri.getScheme() + "://" + uri.getHost())) {
                return;
            }
            downloadPath = uri.getPath().substring(1);
            Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(mime == null ? "text/markdown" : mime)
                .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, new File(downloadPath).getName());
            startActivityForResult(save, 300);
        });
        String route = getIntent().getStringExtra("route");
        web.loadUrl(ContentStore.ORIGIN + safeRoute(route));
        Updater.listener = () -> runOnUiThread(this::emitStatus);
        callback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                if (Updater.wifi(MainActivity.this) != null) {
                    long checked = getSharedPreferences("study", 0).getLong("checked", 0);
                    if (System.currentTimeMillis() - checked > 60000) {
                        Updater.start(MainActivity.this, () -> AppUpdater.start(MainActivity.this, false));
                    }
                }
            }
        };
        getSystemService(ConnectivityManager.class).registerDefaultNetworkCallback(callback);
        SyncJob.schedule(this);
        Widgets.refresh(this);
        Updater.start(this, () -> AppUpdater.start(this, false));
    }

    private void showSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.show(WindowInsets.Type.systemBars());
                int appearance = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(darkTheme ? 0 : appearance, appearance);
            }
        } else {
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
            if (!darkTheme) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }

    private void applyTheme(boolean dark) {
        darkTheme = dark;
        int background = dark ? Color.rgb(15, 24, 39) : Color.rgb(245, 247, 251);
        frame.setBackgroundColor(background);
        web.setBackgroundColor(background);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(background));
        showSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) {
            showSystemBars();
        }
    }

    private static String safeRoute(String route) {
        return route != null && route.startsWith("/") && !route.startsWith("//") && !route.contains("\\") ? route : "/";
    }

    private static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Offline content only", java.util.Collections.emptyMap(),
            new ByteArrayInputStream(new byte[0]));
    }

    private void emitStatus() {
        String version = "";
        try {
            version = ContentStore.manifest(this, content).optString("version");
        } catch (Exception ignored) {
            // Keep the interface usable if status metadata is unavailable.
        }
        String active = getSharedPreferences("study", 0).getString("active", "");
        String script = "window.dispatchEvent(new CustomEvent('native-status',{detail:{status:"
            + JSONObject.quote(Updater.status) + ",available:" + (!active.isEmpty() && !active.equals(version))
            + ",appStatus:" + JSONObject.quote(AppUpdater.status) + ",appReady:" + AppUpdater.ready
            + ",checked:" + getSharedPreferences("study", 0).getLong("checked", 0) + "}}));";
        web.evaluateJavascript(script, null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        showSystemBars();
        if (web != null) {
            web.onResume();
            Widgets.refresh(this);
            Updater.start(this, () -> AppUpdater.start(this, false));
            emitStatus();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        web.loadUrl(ContentStore.ORIGIN + safeRoute(intent.getStringExtra("route")));
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        Updater.listener = null;
        if (callback != null) {
            getSystemService(ConnectivityManager.class).unregisterNetworkCallback(callback);
        }
        web.removeJavascriptInterface("StudyNative");
        web.destroy();
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int request, int result, Intent intent) {
        super.onActivityResult(request, result, intent);
        if (request == 300 && result == RESULT_OK && intent != null && downloadPath != null) {
            try (InputStream input = ContentStore.open(this, content, downloadPath);
                 OutputStream output = getContentResolver().openOutputStream(intent.getData())) {
                if (output != null) {
                    output.write(ContentStore.bytes(input));
                }
            } catch (Exception ignored) {
                Toast.makeText(this, "Не удалось сохранить файл", Toast.LENGTH_LONG).show();
            }
        }
    }

    public final class Bridge {
        @JavascriptInterface
        public void theme(boolean dark) {
            runOnUiThread(() -> applyTheme(dark));
        }

        @JavascriptInterface
        public String version() {
            return "1.0.2";
        }

        @JavascriptInterface
        public String get(String key) {
            return KEYS.contains(key) ? getSharedPreferences("study", 0).getString(key, "") : "";
        }

        @JavascriptInterface
        public void put(String key, String value) {
            if (KEYS.contains(key) && value.length() < 2 * 1024 * 1024) {
                getSharedPreferences("study", 0).edit().putString(key, value).apply();
            }
        }

        @JavascriptInterface
        public void subgroup(int value) {
            if (value == 1 || value == 2) {
                getSharedPreferences("study", 0).edit().putInt("subgroup", value).apply();
                runOnUiThread(() -> Widgets.refresh(MainActivity.this));
            }
        }

        @JavascriptInterface
        public int subgroup() {
            return Schedule.subgroup(MainActivity.this);
        }

        @JavascriptInterface
        public String academicGroup() {
            return Schedule.group(MainActivity.this);
        }

        @JavascriptInterface
        public void setAcademicGroup(String value) {
            try {
                org.json.JSONArray groups = ContentStore.data(MainActivity.this).getJSONObject("schedule").getJSONArray("groups");
                for (int i = 0; i < groups.length(); i++) {
                    if (groups.getJSONObject(i).getString("id").equals(value)) {
                        getSharedPreferences("study", 0).edit().putString("academic-group", value).apply();
                        runOnUiThread(() -> Widgets.refresh(MainActivity.this));
                        return;
                    }
                }
            } catch (Exception ignored) {
                // Keep the previous group when data is unavailable.
            }
        }

        @JavascriptInterface
        public void sync() {
            Updater.start(MainActivity.this, () -> AppUpdater.start(MainActivity.this, true));
        }

        @JavascriptInterface
        public void installAppUpdate() {
            AppUpdater.install(MainActivity.this);
        }

        @JavascriptInterface
        public void applyUpdate() {
            runOnUiThread(() -> {
                content = ContentStore.active(MainActivity.this);
                web.clearCache(true);
                web.reload();
            });
        }

        @JavascriptInterface
        public void printPage() {
            runOnUiThread(() -> getSystemService(PrintManager.class).print("Конспект",
                web.createPrintDocumentAdapter("Конспект"), null));
        }
    }
}
