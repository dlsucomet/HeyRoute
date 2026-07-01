package com.heyroute.wakeword;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.tensorflow.lite.Interpreter;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.util.concurrent.atomic.AtomicBoolean;

public class WakeWordService {
    private static final String TAG = "WakeWordService";
    private static final int SAMPLE_RATE = 16000;
    private static final int CHUNK_SIZE = 1280; // 80ms at 16kHz
    
    private ReactApplicationContext reactContext;
    private AudioRecord audioRecord;
    private AtomicBoolean isRecording = new AtomicBoolean(false);
    private Thread recordingThread;

    private Interpreter melspectrogramInterpreter;
    private Interpreter embeddingInterpreter;
    private Interpreter heyRouteInterpreter;

    // Buffers for models
    // Melspectrogram outputs [1, 1, 1, 32]
    // Embedding model expects [1, 76, 32, 1]
    private float[][][][] embeddingInputBuffer = new float[1][76][32][1];
    private int melFrameIndex = 0;

    // HeyRoute model expects [1, 16, 96]
    private float[][][] heyRouteInputBuffer = new float[1][16][96];
    private int embeddingFrameIndex = 0;

    public WakeWordService(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
        loadModels();
    }

    private void loadModels() {
        try {
            melspectrogramInterpreter = new Interpreter(loadModelFile("melspectrogram.tflite"));
            melspectrogramInterpreter.resizeInput(0, new int[]{1, CHUNK_SIZE}); // Dynamic to 1280
            melspectrogramInterpreter.allocateTensors();
            
            embeddingInterpreter = new Interpreter(loadModelFile("embedding_model.tflite"));
            heyRouteInterpreter = new Interpreter(loadModelFile("hey_route.tflite"));
            Log.d(TAG, "OpenWakeWord Models loaded successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error loading TFLite models", e);
        }
    }

    private MappedByteBuffer loadModelFile(String modelPath) throws IOException {
        var assetFileDescriptor = reactContext.getAssets().openFd(modelPath);
        FileInputStream inputStream = new FileInputStream(assetFileDescriptor.getFileDescriptor());
        FileChannel fileChannel = inputStream.getChannel();
        long startOffset = assetFileDescriptor.getStartOffset();
        long declaredLength = assetFileDescriptor.getDeclaredLength();
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength);
    }

    public void startListening() {
        if (isRecording.get()) return;

        int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT);
                
        if (bufferSize < CHUNK_SIZE * 2) {
            bufferSize = CHUNK_SIZE * 2;
        }

        try {
            audioRecord = new AudioRecord(MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize);
                    
            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord initialization failed");
                return;
            }

            audioRecord.startRecording();
            isRecording.set(true);

            recordingThread = new Thread(this::recordLoop);
            recordingThread.start();
            Log.d(TAG, "Wake word listener started");
        } catch (SecurityException e) {
            Log.e(TAG, "Microphone permission denied", e);
        }
    }

    public void stopListening() {
        if (!isRecording.get()) return;
        isRecording.set(false);

        if (audioRecord != null) {
            audioRecord.stop();
            audioRecord.release();
            audioRecord = null;
        }

        if (recordingThread != null) {
            try {
                recordingThread.join();
            } catch (InterruptedException e) {
                Log.e(TAG, "Thread join interrupted", e);
            }
            recordingThread = null;
        }
        Log.d(TAG, "Wake word listener stopped");
    }

    private void recordLoop() {
        short[] audioBuffer = new short[CHUNK_SIZE];
        float[][] floatBuffer = new float[1][CHUNK_SIZE];
        
        float[][][][] melOutput = new float[1][1][1][32];

        while (isRecording.get()) {
            int read = audioRecord.read(audioBuffer, 0, CHUNK_SIZE);
            if (read == CHUNK_SIZE) {
                // Convert PCM 16-bit to float for OpenWakeWord
                for (int i = 0; i < CHUNK_SIZE; i++) {
                    floatBuffer[0][i] = (float) audioBuffer[i];
                }

                if (melspectrogramInterpreter != null) {
                    // 1. Melspectrogram
                    melspectrogramInterpreter.run(floatBuffer, melOutput);
                    
                    // Shift window and append new mel frame
                    for (int i = 0; i < 75; i++) {
                        for (int j = 0; j < 32; j++) {
                            embeddingInputBuffer[0][i][j][0] = embeddingInputBuffer[0][i+1][j][0];
                        }
                    }
                    for (int j = 0; j < 32; j++) {
                        embeddingInputBuffer[0][75][j][0] = melOutput[0][0][0][j];
                    }
                    // 2. Embedding Model (runs continuously on the sliding window)
                    float[][][][] embeddingOutput = new float[1][1][1][96];
                    embeddingInterpreter.run(embeddingInputBuffer, embeddingOutput);

                    // Shift window and append new embedding frame
                    for (int i = 0; i < 15; i++) {
                        System.arraycopy(heyRouteInputBuffer[0][i+1], 0, heyRouteInputBuffer[0][i], 0, 96);
                    }
                    for (int j = 0; j < 96; j++) {
                        heyRouteInputBuffer[0][15][j] = embeddingOutput[0][0][0][j];
                    }

                    // 3. Hey Route Model (runs continuously on the 16-frame embedding window)
                    float[][] scoreOutput = new float[1][1];
                    heyRouteInterpreter.run(heyRouteInputBuffer, scoreOutput);
                    
                    float score = scoreOutput[0][0];
                    
                    if (score > 0.4f) { // Wake Word Threshold (lowered slightly for better recall)
                        Log.i(TAG, "Wake word detected! Confidence Score: " + score);
                        emitDetectionEvent();
                        
                        // Clear buffers to avoid immediate double-trigger while allowing instant re-listening
                        embeddingInputBuffer = new float[1][76][32][1];
                        heyRouteInputBuffer = new float[1][16][96];
                    }
                }
            }
        }
    }

    private void emitDetectionEvent() {
        if (reactContext != null) {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onWakeWordDetected", null);
        }
    }
}
