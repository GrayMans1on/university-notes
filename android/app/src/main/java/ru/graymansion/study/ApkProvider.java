package ru.graymansion.study;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

public final class ApkProvider extends ContentProvider {
    static Uri uri(android.content.Context context) {
        return Uri.parse("content://" + context.getPackageName() + ".apk/app.apk");
    }

    private File file(Uri uri) throws FileNotFoundException {
        if (getContext() == null || !uri(getContext()).equals(uri)) {
            throw new FileNotFoundException("Invalid APK URI");
        }
        return new File(getContext().getCacheDir(), "updates/app.apk");
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) {
            throw new FileNotFoundException("Read-only APK provider");
        }
        return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sortOrder) {
        try {
            File file = file(uri);
            String[] columns = projection == null ? new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE } : projection;
            MatrixCursor cursor = new MatrixCursor(columns, 1);
            Object[] values = new Object[columns.length];
            for (int i = 0; i < columns.length; i++) {
                values[i] = OpenableColumns.DISPLAY_NAME.equals(columns[i]) ? "app.apk"
                    : OpenableColumns.SIZE.equals(columns[i]) ? file.length() : null;
            }
            cursor.addRow(values);
            return cursor;
        } catch (FileNotFoundException ignored) {
            return null;
        }
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("Read-only APK provider");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) {
        throw new UnsupportedOperationException("Read-only APK provider");
    }

    @Override
    public int delete(Uri uri, String selection, String[] args) {
        throw new UnsupportedOperationException("Read-only APK provider");
    }
}
