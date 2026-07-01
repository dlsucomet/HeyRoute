package com.heyroute.wakeword;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class WakeWordModule extends ReactContextBaseJavaModule {
    private WakeWordService wakeWordService;

    public WakeWordModule(ReactApplicationContext reactContext) {
        super(reactContext);
        wakeWordService = new WakeWordService(reactContext);
    }

    @Override
    public String getName() {
        return "WakeWordModule";
    }

    @ReactMethod
    public void startListening() {
        Intent serviceIntent = new Intent(reactContext, WakeWordService.class);
        reactContext.startService(serviceIntent);
    }

    @ReactMethod
    public void simulateWakeWord() {
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onWakeWordDetected", 0.999f);
    }

    @ReactMethod
    public void stopListening() {
        wakeWordService.stopListening();
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Keep: Required for RN built in Event Emitter Calls.
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        // Keep: Required for RN built in Event Emitter Calls.
    }
}
