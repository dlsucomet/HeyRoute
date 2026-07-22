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
    private static final int MEL_FRAMES_PER_CHUNK = 5; // Melspectrogram outputs 5 frames per 1280 samples
    private static final int MEL_FEATURES = 32;
    private static final int EMB_WINDOW = 76; // Embedding model expects 76 mel frames
    private static final int EMB_FEATURES = 96;
    private static final int WW_WINDOW = 16; // Wake word model expects 16 embedding frames
    private static final float DETECTION_THRESHOLD = 0.5f;
    
    private ReactApplicationContext reactContext;
    private AudioRecord audioRecord;
    private AtomicBoolean isRecording = new AtomicBoolean(false);
    private Thread recordingThread;

    private Interpreter melspectrogramInterpreter;
    private Interpreter embeddingInterpreter;
    private Interpreter sparrowInterpreter;

    /**
     * Flat mel-spectrogram accumulation buffer.
     * 
     * The reference OpenWakeWord implementation accumulates mel frames into a flat
     * growing buffer and feeds the LAST 76 frames to the embedding model.
     * Our previous implementation used a fixed sliding window which produced 
     * incorrect temporal context for the embedding model.
     */
    private float[][] melspectrogramBuffer;
    private int melBufferSize = 0;
    private static final int MEL_BUFFER_MAX = 200; // Max frames to keep (prevents unbounded growth)

    /**
     * Flat embedding feature accumulation buffer.
     * Same pattern: accumulate embeddings, feed the LAST 16 to the wake word model.
     */
    private float[][] featureBuffer;
    private int featureBufferSize = 0;
    private static final int FEATURE_BUFFER_MAX = 120;

    public WakeWordService(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
        loadModels();
    }

    private void loadModels() {
        try {
            melspectrogramInterpreter = new Interpreter(loadModelFile("melspectrogram.tflite"));
            embeddingInterpreter = new Interpreter(loadModelFile("embedding_model.tflite"));
            sparrowInterpreter = new Interpreter(loadModelFile("sparrow.tflite"));
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
        int loopCounter = 0;

        // Initialize flat accumulation buffers
        melspectrogramBuffer = new float[MEL_BUFFER_MAX][MEL_FEATURES];
        melBufferSize = 0;
        featureBuffer = new float[FEATURE_BUFFER_MAX][EMB_FEATURES];
        featureBufferSize = 0;

        while (isRecording.get()) {
            int read = audioRecord.read(audioBuffer, 0, CHUNK_SIZE);
            if (read == CHUNK_SIZE) {
                // Convert PCM 16-bit to float32 for the melspectrogram model.
                // The reference OpenWakeWord implementation casts int16 to float32 directly
                // (no normalization to [-1, 1] range needed).
                for (int i = 0; i < CHUNK_SIZE; i++) {
                    floatBuffer[0][i] = (float) audioBuffer[i];
                }

                if (melspectrogramInterpreter != null) {
                    // ============================================================
                    // Stage 1: Melspectrogram
                    // ============================================================
                    float[][][][] melOutput = new float[1][1][MEL_FRAMES_PER_CHUNK][MEL_FEATURES];
                    melspectrogramInterpreter.run(floatBuffer, melOutput);

                    // Apply the OpenWakeWord melspec transform: x/10 + 2
                    // This transform aligns the TFLite melspectrogram output with Google's
                    // speech_embedding model expectations. Without this, the embedding model
                    // receives values in the wrong numerical range and produces garbage.
                    for (int f = 0; f < MEL_FRAMES_PER_CHUNK; f++) {
                        // Compact the buffer if it's full
                        if (melBufferSize >= MEL_BUFFER_MAX) {
                            int keep = EMB_WINDOW; // Keep at least 76 frames
                            System.arraycopy(melspectrogramBuffer, melBufferSize - keep,
                                    melspectrogramBuffer, 0, keep);
                            melBufferSize = keep;
                        }
                        for (int j = 0; j < MEL_FEATURES; j++) {
                            melspectrogramBuffer[melBufferSize][j] = melOutput[0][0][f][j] / 10.0f + 2.0f;
                        }
                        melBufferSize++;
                    }

                    // ============================================================
                    // Stage 2: Audio Embedding
                    // Only run once we have accumulated enough mel frames (76+)
                    // ============================================================
                    if (melBufferSize >= EMB_WINDOW) {
                        // Build embedding input from the LAST 76 mel frames (flat buffer approach)
                        float[][][][] embInput = new float[1][EMB_WINDOW][MEL_FEATURES][1];
                        int startIdx = melBufferSize - EMB_WINDOW;
                        for (int i = 0; i < EMB_WINDOW; i++) {
                            for (int j = 0; j < MEL_FEATURES; j++) {
                                embInput[0][i][j][0] = melspectrogramBuffer[startIdx + i][j];
                            }
                        }

                        float[][][][] embOutput = new float[1][1][1][EMB_FEATURES];
                        embeddingInterpreter.run(embInput, embOutput);

                        // Accumulate embedding into feature buffer
                        if (featureBufferSize >= FEATURE_BUFFER_MAX) {
                            int keep = WW_WINDOW;
                            System.arraycopy(featureBuffer, featureBufferSize - keep,
                                    featureBuffer, 0, keep);
                            featureBufferSize = keep;
                        }
                        for (int j = 0; j < EMB_FEATURES; j++) {
                            featureBuffer[featureBufferSize][j] = embOutput[0][0][0][j];
                        }
                        featureBufferSize++;

                        // ============================================================
                        // Stage 3: Wake Word Detection
                        // Only run once we have accumulated enough embeddings (16+)
                        // ============================================================
                        if (featureBufferSize >= WW_WINDOW) {
                            // Build input from the LAST 16 embedding frames
                            float[][][] wwInput = new float[1][WW_WINDOW][EMB_FEATURES];
                            int wwStartIdx = featureBufferSize - WW_WINDOW;
                            for (int i = 0; i < WW_WINDOW; i++) {
                                System.arraycopy(featureBuffer[wwStartIdx + i], 0, wwInput[0][i], 0, EMB_FEATURES);
                            }

                            float[][] scoreOutput = new float[1][1];
                            sparrowInterpreter.run(wwInput, scoreOutput);

                            float score = scoreOutput[0][0];

                            // Debug logging every ~2 seconds (25 chunks * 80ms)
                            loopCounter++;
                            if (loopCounter % 25 == 0) {
                                float maxAmp = 0;
                                for (int i = 0; i < CHUNK_SIZE; i++) {
                                    if (Math.abs(audioBuffer[i]) > maxAmp) maxAmp = Math.abs(audioBuffer[i]);
                                }
                                Log.d(TAG, "[Debug] Mic Amp: " + maxAmp + " | MelBuf: " + melBufferSize 
                                    + " | FeatBuf: " + featureBufferSize + " | Score: " + score);
                            }

                            if (score > DETECTION_THRESHOLD) {
                                Log.i(TAG, "Wake word detected! Score: " + score);
                                emitDetectionEvent(score);

                                // Reset buffers after detection to prevent double-triggers
                                melBufferSize = 0;
                                featureBufferSize = 0;
                            }
                        }
                    }
                } else {
                    loopCounter++;
                }
            }
        }
    }

    private void emitDetectionEvent(float score) {
        if (reactContext != null) {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onWakeWordDetected", score);
        }
    }
}
