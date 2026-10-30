package ru.graymansion.study;

import android.app.Activity;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.graphics.drawable.GradientDrawable;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.os.Build;
import java.io.File;

public final class PdfActivity extends Activity {
    private PdfRenderer renderer;
    private ParcelFileDescriptor descriptor;
    private Bitmap bitmap;
    private PdfImage image;
    private TextView counter;
    private TextView pagePreview;
    private SeekBar pageSlider;
    private boolean draggingPage;
    private Button previous;
    private Button next;
    private int page;
    private int ink;
    private int surface;
    private int accent;
    private String bookId;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        boolean dark = getIntent().getBooleanExtra("dark", false);
        ink = Color.parseColor(dark ? "#E4EBF5" : "#182333");
        surface = Color.parseColor(dark ? "#172234" : "#FFFFFF");
        accent = Color.parseColor(dark ? "#A8BCFF" : "#254CCE");
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor(dark ? "#0F1827" : "#F5F7FB"));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        setContentView(root);
        getWindow().setStatusBarColor(surface);
        getWindow().setNavigationBarColor(surface);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.show(WindowInsets.Type.systemBars());
                int flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(dark ? 0 : flags, flags);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(dark ? 0 : android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        LinearLayout controls = new LinearLayout(this);
        controls.setPadding(8, 8, 8, 8);
        Button close = button("Закрыть");
        close.setOnClickListener((view) -> finish());
        previous = button("Назад");
        next = button("Далее");
        counter = new TextView(this);
        counter.setTextColor(ink);
        counter.setGravity(android.view.Gravity.CENTER);
        controls.addView(close);
        controls.addView(previous);
        controls.addView(counter, new LinearLayout.LayoutParams(0, -1, 1));
        controls.addView(next);
        root.addView(controls);
        TextView hint = new TextView(this);
        hint.setText("Масштаб — двумя пальцами, перемещение — одним");
        hint.setTextColor(ink);
        hint.setTextSize(11);
        hint.setGravity(android.view.Gravity.CENTER);
        root.addView(hint);
        image = new PdfImage(this);
        root.addView(image, new LinearLayout.LayoutParams(-1, 0, 1));
        android.view.View divider = new android.view.View(this);
        int line = Color.parseColor(dark ? "#33445F" : "#E2E7F0");
        divider.setBackgroundColor(line);
        root.addView(divider, new LinearLayout.LayoutParams(-1, dp(1)));
        LinearLayout pageControls = new LinearLayout(this);
        pageControls.setOrientation(LinearLayout.VERTICAL);
        pageControls.setBackgroundColor(surface);
        pageControls.setMinimumHeight(dp(88));
        pageControls.setPadding(dp(16), dp(8), dp(16), dp(12));
        pagePreview = new TextView(this);
        pagePreview.setTextColor(ink);
        pagePreview.setTextSize(12);
        pagePreview.setGravity(android.view.Gravity.CENTER);
        pageControls.addView(pagePreview);
        pageSlider = new SeekBar(this);
        pageSlider.setContentDescription("Быстрый переход по страницам учебника");
        pageSlider.setEnabled(false);
        pageSlider.setProgressTintList(android.content.res.ColorStateList.valueOf(accent));
        pageSlider.setThumbTintList(android.content.res.ColorStateList.valueOf(accent));
        pageSlider.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(line));
        pageControls.addView(pageSlider, new LinearLayout.LayoutParams(-1, dp(48)));
        root.addView(pageControls, new LinearLayout.LayoutParams(-1, -2));
        pageSlider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (renderer == null) { return; }
                updatePagePreview(progress);
                if (fromUser && !draggingPage) { goToPage(progress); }
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) { draggingPage = true; }

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
                draggingPage = false;
                goToPage(seekBar.getProgress());
            }
        });
        previous.setOnClickListener((view) -> goToPage(page - 1));
        next.setOnClickListener((view) -> goToPage(page + 1));
        try {
            bookId = getIntent().getStringExtra("book");
            org.json.JSONObject book = Textbooks.find(this, bookId);
            File file = Textbooks.file(this, book);
            if (!file.isFile() || file.length() != book.getLong("size")) { throw new java.io.IOException("PDF не скачан"); }
            descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
            renderer = new PdfRenderer(descriptor);
            page = state == null ? getSharedPreferences("pdf-pages", 0).getInt(bookId, 0) : state.getInt("page", 0);
            page = Math.max(0, Math.min(page, renderer.getPageCount() - 1));
            render();
        } catch (Exception ignored) {
            Toast.makeText(this, "Не удалось открыть PDF", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void updatePagePreview(int selected) {
        String label = "Страница " + (selected + 1) + " из " + renderer.getPageCount();
        pagePreview.setText(label);
        if (Build.VERSION.SDK_INT >= 30) { pageSlider.setStateDescription(label); }
    }

    private void goToPage(int requested) {
        if (renderer == null) { return; }
        int target = Math.max(0, Math.min(requested, renderer.getPageCount() - 1));
        if (target != page) {
            page = target;
            render();
        }
    }

    private Button button(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(accent);
        button.setTextSize(12);
        button.setAllCaps(false);
        button.setMinWidth(0);
        GradientDrawable background = new GradientDrawable();
        background.setColor(surface);
        background.setCornerRadius(12);
        background.setStroke(1, ink);
        button.setBackground(background);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, Math.round(48 * getResources().getDisplayMetrics().density));
        params.setMargins(3, 0, 3, 0);
        button.setLayoutParams(params);
        return button;
    }

    private void render() {
        if (renderer == null) { return; }
        try (PdfRenderer.Page current = renderer.openPage(page)) {
            int width = Math.min(1600, Math.max(720, getResources().getDisplayMetrics().widthPixels * 2));
            int height = Math.min(6000, Math.round((float) width * current.getHeight() / current.getWidth()));
            Bitmap nextBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            nextBitmap.eraseColor(Color.WHITE);
            current.render(nextBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            image.show(nextBitmap);
            if (bitmap != null) { bitmap.recycle(); }
            bitmap = nextBitmap;
            counter.setText((page + 1) + " / " + renderer.getPageCount());
            image.setContentDescription("Страница " + (page + 1));
            previous.setEnabled(page > 0);
            next.setEnabled(page + 1 < renderer.getPageCount());
            pageSlider.setMax(renderer.getPageCount() - 1);
            pageSlider.setProgress(page);
            pageSlider.setEnabled(renderer.getPageCount() > 1);
            updatePagePreview(page);
            getSharedPreferences("pdf-pages", 0).edit().putInt(bookId, page).apply();
        } catch (RuntimeException ignored) {
            Toast.makeText(this, "Не удалось отобразить страницу PDF", Toast.LENGTH_LONG).show();
        }
    }

    private static final class PdfImage extends android.view.View {
        private Bitmap page;
        private float scale;
        private float fit;
        private float x;
        private float y;
        private final android.view.ScaleGestureDetector zoom;
        private final android.view.GestureDetector pan;

        PdfImage(android.content.Context context) {
            super(context);
            setFocusable(true);
            zoom = new android.view.ScaleGestureDetector(context, new android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
                @Override
                public boolean onScale(android.view.ScaleGestureDetector detector) {
                    if (page == null || fit <= 0) { return false; }
                    float next = Math.max(fit, Math.min(fit * 5, scale * detector.getScaleFactor()));
                    float ratio = next / scale;
                    x = detector.getFocusX() - (detector.getFocusX() - x) * ratio;
                    y = detector.getFocusY() - (detector.getFocusY() - y) * ratio;
                    scale = next;
                    constrain();
                    return true;
                }
            });
            pan = new android.view.GestureDetector(context, new android.view.GestureDetector.SimpleOnGestureListener() {
                @Override
                public boolean onDown(android.view.MotionEvent event) { return true; }
                @Override
                public boolean onSingleTapUp(android.view.MotionEvent event) { return performClick(); }
                @Override
                public boolean onScroll(android.view.MotionEvent start, android.view.MotionEvent end, float dx, float dy) {
                    if (!zoom.isInProgress()) { x -= dx; y -= dy; constrain(); }
                    return true;
                }
            });
        }

        void show(Bitmap value) {
            page = value;
            reset();
        }

        private void reset() {
            if (page == null || getWidth() == 0) { return; }
            fit = (float) getWidth() / page.getWidth();
            scale = fit;
            x = 0;
            y = 0;
            invalidate();
        }

        private void constrain() {
            if (page == null) { return; }
            x = Math.max(Math.min(0, getWidth() - page.getWidth() * scale), Math.min(0, x));
            y = Math.max(Math.min(0, getHeight() - page.getHeight() * scale), Math.min(0, y));
            invalidate();
        }

        @Override
        protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) { reset(); }
        @Override
        protected void onDraw(android.graphics.Canvas canvas) {
            super.onDraw(canvas);
            if (page == null) { return; }
            canvas.save();
            canvas.translate(x, y);
            canvas.scale(scale, scale);
            canvas.drawBitmap(page, 0, 0, null);
            canvas.restore();
        }
        @Override
        public boolean onTouchEvent(android.view.MotionEvent event) {
            zoom.onTouchEvent(event);
            pan.onTouchEvent(event);
            return true;
        }
        @Override
        public boolean performClick() { super.performClick(); return true; }
    }

    @Override
    public void onSaveInstanceState(Bundle out) {
        out.putInt("page", page);
        super.onSaveInstanceState(out);
    }

    @Override
    public void onDestroy() {
        if (renderer != null) { renderer.close(); }
        if (descriptor != null) {
            try { descriptor.close(); } catch (java.io.IOException ignored) { /* The renderer is already closed. */ }
        }
        if (bitmap != null) { bitmap.recycle(); }
        super.onDestroy();
    }
}
