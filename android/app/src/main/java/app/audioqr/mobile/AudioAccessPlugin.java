package app.audioqr.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AudioAccess", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
})
public class AudioAccessPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private byte[] pendingWave;
    private boolean exporting = false;

    @PluginMethod
    public void checkMicrophone(PluginCall call) { resolvePermission(call); }

    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) resolvePermission(call);
        else requestPermissionForAlias("microphone", call, "microphoneCallback");
    }

    @PermissionCallback
    private void microphoneCallback(PluginCall call) { resolvePermission(call); }

    private void resolvePermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("microphone", getPermissionState("microphone").toString());
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent); call.resolve();
            } catch (Exception e) { call.reject("Unable to open settings", e); }
        });
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        getActivity().runOnUiThread(() -> {
            if (enabled) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @PluginMethod
    public void exportWave(PluginCall call) {
        if (exporting) { call.reject("An export is already in progress"); return; }
        String data = call.getString("data", "");
        if (data.length() > 35 * 1024 * 1024) { call.reject("File is too large"); return; }
        byte[] bytes;
        try { bytes = Base64.decode(data, Base64.DEFAULT); }
        catch (Exception e) { call.reject("Invalid audio data", e); return; }
        if (bytes.length < 44 || bytes.length > 25 * 1024 * 1024 || bytes[0] != 'R' || bytes[1] != 'I' || bytes[2] != 'F' || bytes[3] != 'F' || bytes[8] != 'W' || bytes[9] != 'A' || bytes[10] != 'V' || bytes[11] != 'E') {
            call.reject("Invalid WAV file"); return;
        }
        String name = call.getString("filename", "audio-qr.wav").replaceAll("[^A-Za-z0-9._-]", "_");
        if (!name.endsWith(".wav")) name += ".wav";
        final String filename = name;
        exporting = true;
        if (call.getBoolean("share", false)) {
            io.execute(() -> {
                try {
                    File directory = new File(getContext().getCacheDir(), "audio-qr");
                    directory.mkdirs();
                    File[] old = directory.listFiles();
                    if (old != null) for (File file : old) if (System.currentTimeMillis() - file.lastModified() > 24 * 60 * 60 * 1000L) file.delete();
                    // Unique filenames avoid replacing files already opened by a share target.
                    File file = new File(directory, System.currentTimeMillis() + "-" + filename);
                    try (FileOutputStream stream = new FileOutputStream(file)) { stream.write(bytes); }
                    Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("audio/wav"); send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.setClipData(android.content.ClipData.newRawUri("Audio QR", uri));
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    getActivity().runOnUiThread(() -> {
                        try { getActivity().startActivity(Intent.createChooser(send, "Audio QR")); call.resolve(new JSObject().put("shared", true)); }
                        catch (Exception e) { call.reject("Unable to share audio", e); }
                        finally { exporting = false; }
                    });
                } catch (Exception e) { exporting = false; call.reject("Unable to share audio", e); }
            });
        } else {
            pendingWave = bytes;
            Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            create.addCategory(Intent.CATEGORY_OPENABLE); create.setType("audio/wav");
            create.putExtra(Intent.EXTRA_TITLE, filename);
            getActivity().runOnUiThread(() -> {
                try { startActivityForResult(call, create, "saveWaveResult"); }
                catch (Exception e) { pendingWave = null; exporting = false; call.reject("Unable to open file picker", e); }
            });
        }
    }

    @ActivityCallback
    private void saveWaveResult(PluginCall call, ActivityResult result) {
        byte[] bytes = pendingWave; pendingWave = null;
        if (call == null) { exporting = false; return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            exporting = false; call.resolve(new JSObject().put("saved", false)); return;
        }
        Uri uri = result.getData().getData();
        if (bytes == null) { exporting = false; call.reject("Export was interrupted; please try again"); return; }
        io.execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (stream == null) throw new IllegalStateException("Destination is unavailable");
                stream.write(bytes); stream.flush(); call.resolve(new JSObject().put("saved", true));
            } catch (Exception e) { call.reject("Unable to save WAV", e); }
            finally { exporting = false; }
        });
    }

    @Override
    protected void handleOnPause() {
        getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    @Override
    protected void handleOnDestroy() { pendingWave = null; io.shutdown(); }
}
