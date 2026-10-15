package ai.umage.span;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * SPAN: one full-screen WebView running the game bundled in assets/www (docs/NATIVE.md).
 * The files are served from https://appassets.androidplatform.net, a fixed secure origin, so the game's
 * localStorage (progress, designs, settings) survives app updates. Never change HOST: players would lose their saves.
 * The page sees window.SpanNative (the Bridge below) and the shell calls BG.Native (js/features/native.js).
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/assets/www/index.html";
    static final int REQ_SAVE = 1, REQ_OPEN = 2;

    private WebView web;
    private String pendingSave;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0D1424);
        setContentView(web);
        goFullScreen();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setTextZoom(100); // the HUD is laid out for 100 %; the system font size would push text out of its buttons

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                openExternal(u); // About-screen links, GitHub, umage.ai: the browser, not the game's WebView
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                recreate(); // the game autosaves, so a fresh start loses at most a moment
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // Settings > Save data > Import: <input type="file">
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_OPEN);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "SpanNative");

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        if (state == null || web.restoreState(state) == null) web.loadUrl(START_URL);
    }

    /** Back = Esc in the game; on the title screen with nothing open it leaves the app. */
    private void handleBack() {
        web.evaluateJavascript("!!(window.BG && BG.Native && BG.Native.back())", handled -> {
            if (!"true".equals(handled)) finish();
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() { // Android 8 - 12 (13+ uses the OnBackInvokedCallback above)
        handleBack();
    }

    private void goFullScreen() {
        if (Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                    ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                    : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) goFullScreen();
    }

    private void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
            // no browser: nothing to do
        }
    }

    private void js(String code) {
        if (web != null) web.evaluateJavascript("try{" + code + "}catch(e){}", null);
    }

    @Override
    protected void onPause() {
        js("BG.Native.pause()");
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        js("BG.Native.resume()");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_OPEN) {
            if (fileCallback != null) fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        } else if (requestCode == REQ_SAVE) {
            String text = pendingSave;
            pendingSave = null;
            Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
            if (uri == null || text == null) {
                js("BG.Native.saved(null)");
                return;
            }
            boolean ok = false;
            try (OutputStream os = getContentResolver().openOutputStream(uri, "wt")) {
                if (os != null) {
                    os.write(text.getBytes(StandardCharsets.UTF_8));
                    ok = true;
                }
            } catch (Exception e) {
                ok = false;
            }
            js("BG.Native.saved(" + ok + ")");
        }
    }

    /** window.SpanNative: what the game may ask of the app. Called on a WebView thread. */
    final class Bridge {
        @JavascriptInterface
        public String getPlatform() {
            return "android";
        }

        @JavascriptInterface
        public String getVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        /** Settings > Save data > Export: the system "save as" picker. */
        @JavascriptInterface
        public boolean saveFile(String name, String text) {
            runOnUiThread(() -> {
                pendingSave = text;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json")
                        .putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(i, REQ_SAVE);
                } catch (ActivityNotFoundException e) {
                    pendingSave = null;
                    js("BG.Native.saved(false)");
                }
            });
            return true;
        }
    }
}
