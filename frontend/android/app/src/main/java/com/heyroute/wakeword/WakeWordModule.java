package com.heyroute.wakeword;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import com.facebook.react.modules.core.DeviceEventManagerModule;

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
        wakeWordService.startListening();
    }

    @ReactMethod
    public void simulateWakeWord() {
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
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
