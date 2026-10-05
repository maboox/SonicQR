package app.audioqr.mobile;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AudioAccessPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
