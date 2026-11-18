package com.nexo.crm;

import android.app.*;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.print.PrintManager;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.net.URI;

/** Online client only. No JavaScript/native bridge and no TLS-error bypass. */
public class MainActivity extends Activity {
    private WebView web;
    private String server;
    private ValueCallback<Uri[]> files;
    private static final int PICK_FILES = 10;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        server = getPreferences(MODE_PRIVATE).getString("server", BuildConfig.DEFAULT_SERVER);
        if (validServer(server)) openServer(); else configure();
    }
    private boolean validServer(String value) {
        try {
            URI u = new URI(value);
            String h = u.getHost();
            boolean local = h != null && (h.equals("localhost") || h.matches("127\\.\\d+\\.\\d+\\.\\d+")
                || h.matches("10\\.\\d+\\.\\d+\\.\\d+") || h.matches("192\\.168\\.\\d+\\.\\d+")
                || h.matches("172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+"));
            return h != null && u.getUserInfo() == null && u.getQuery() == null && u.getFragment() == null
                && (u.getPath().isEmpty() || u.getPath().equals("/"))
                && ("https".equals(u.getScheme()) || (BuildConfig.DEBUG && local && "http".equals(u.getScheme())));
        } catch (Exception e) { return false; }
    }
    private boolean trusted(String value) {
        try {
            URI a = new URI(server), b = new URI(value);
            int ap = a.getPort() == -1 ? ("https".equals(a.getScheme()) ? 443 : 80) : a.getPort();
            int bp = b.getPort() == -1 ? ("https".equals(b.getScheme()) ? 443 : 80) : b.getPort();
            return a.getScheme().equals(b.getScheme()) && a.getHost().equalsIgnoreCase(b.getHost()) && ap == bp;
        } catch (Exception e) { return false; }
    }
    private Button button(String text, Runnable action) {
        Button b = new Button(this); b.setText(text); b.setOnClickListener(v -> action.run()); return b;
    }
    private LinearLayout column() {
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);
        layout.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets;
        });
        return layout;
    }
    private void configure() {
        LinearLayout layout = column();
        TextView message = new TextView(this);
        message.setText("NEXO CRM · Beta\nConecta con tu servidor Nexo. Necesitas su dirección HTTPS y una cuenta. Esta app no incluye el servidor.");
        message.setPadding(24,24,24,24); layout.addView(message);
        EditText address = new EditText(this);
        address.setSingleLine(true); address.setHint("https://crm.example.com");
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setText(server); layout.addView(address);
        layout.addView(button("Conectar", () -> {
            String value = address.getText().toString().trim();
            if (!validServer(value)) { address.setError("Introduce la raíz HTTPS de tu servidor, sin rutas ni credenciales"); return; }
            server = value; getPreferences(MODE_PRIVATE).edit().putString("server", server).apply(); openServer();
        }));
        setContentView(layout);
    }
    private void resetConnection() {
        new AlertDialog.Builder(this).setTitle("Cambiar conexión")
            .setMessage("Se cerrará la sesión local. Necesitarás la dirección del servidor y volver a iniciar sesión.")
            .setPositiveButton("Continuar", (d,w) -> {
                if (web != null) { web.destroy(); web = null; }
                WebStorage.getInstance().deleteAllData();
                CookieManager.getInstance().removeAllCookies(done -> {
                    CookieManager.getInstance().flush();
                    getPreferences(MODE_PRIVATE).edit().remove("server").apply(); configure();
                });
            }).setNegativeButton("Cancelar", null).show();
    }
    private void openServer() {
        if (web != null) web.destroy();
        LinearLayout layout = column();
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.addView(button("Atrás", () -> { if (web.canGoBack()) web.goBack(); }));
        toolbar.addView(button("Recargar", () -> web.reload()));
        toolbar.addView(button("Conexión", this::resetConnection));
        layout.addView(toolbar);
        web = makeWebView(false);
        layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout); web.loadUrl(server);
    }
    private WebView makeWebView(boolean document) {
        WebView view = new WebView(this);
        WebSettings settings = view.getSettings();
        // Shared online-document protocol; intercepted below, without a JS bridge.
        settings.setUserAgentString(settings.getUserAgentString() + " NexoDesktop/0.1 AndroidApp");
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(!document);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String url = r.getUrl().toString();
                if (trusted(url) && "/__native/print".equals(r.getUrl().getPath())) {
                    ((PrintManager)getSystemService(PRINT_SERVICE)).print("Presupuesto NEXO",
                        v.createPrintDocumentAdapter("Presupuesto NEXO"), null);
                    return true;
                }
                if (trusted(url) || (document && url.equals("about:blank"))) return false;
                if (r.hasGesture() && (url.startsWith("https://") || url.startsWith("mailto:") || url.startsWith("tel:"))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (ActivityNotFoundException ignored) {}
                }
                return true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) new AlertDialog.Builder(MainActivity.this).setTitle("No se puede conectar")
                    .setMessage("Comprueba la red y que el servidor esté encendido.")
                    .setPositiveButton("Reintentar", (d,w) -> v.reload()).setNegativeButton("Cerrar", null).show();
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!trusted(v.getUrl())) return false;
                if (files != null) files.onReceiveValue(null);
                files = callback;
                try { startActivityForResult(params.createIntent(), PICK_FILES); }
                catch (ActivityNotFoundException e) { files.onReceiveValue(null); files = null; }
                return true;
            }
            @Override public boolean onCreateWindow(WebView v, boolean isDialog, boolean gesture, Message result) {
                if (document || !gesture || !trusted(v.getUrl())) return false;
                Dialog dialog = new Dialog(MainActivity.this);
                LinearLayout page = column(); WebView child = makeWebView(true);
                page.addView(button("Imprimir / Guardar PDF", () -> ((PrintManager)getSystemService(PRINT_SERVICE))
                    .print("Presupuesto NEXO", child.createPrintDocumentAdapter("Presupuesto NEXO"), null)));
                page.addView(button("Cerrar documento", dialog::dismiss));
                page.addView(child, new LinearLayout.LayoutParams(-1, 0, 1)); dialog.setContentView(page);
                dialog.setOnDismissListener(d -> child.destroy()); dialog.show();
                dialog.getWindow().setLayout(-1, -1);
                ((WebView.WebViewTransport)result.obj).setWebView(child); result.sendToTarget(); return true;
            }
        });
        return view;
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILES && files != null) {
            Uri[] chosen = WebChromeClient.FileChooserParams.parseResult(result, data);
            java.util.ArrayList<Uri> safe = new java.util.ArrayList<>();
            if (chosen != null) for (Uri uri : chosen) {
                if (uri != null && "content".equals(uri.getScheme())) safe.add(uri);
            }
            files.onReceiveValue(safe.isEmpty() ? null : safe.toArray(new Uri[0])); files = null;
        }
    }
    @Override public void onBackPressed() { if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() {
        if (files != null) { files.onReceiveValue(null); files = null; }
        if (web != null) web.destroy(); super.onDestroy();
    }
}
