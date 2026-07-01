"""
Final validation: compare our fixed TFLite pipeline against the reference OpenWakeWord library.
"""
import numpy as np
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

from openwakeword.model import Model as OWWModel, AudioFeatures
import tensorflow as tf

# ---- Create reference preprocessor (ONNX) ----
af = AudioFeatures(inference_framework='onnx')

# Generate test audio (2 seconds of speech-like signal)
np.random.seed(42)
duration = 3.0
sr = 16000
t = np.linspace(0, duration, int(sr * duration))
audio = (np.sin(2*np.pi*300*t) * 0.3 + 
         np.sin(2*np.pi*600*t) * 0.2 +
         np.random.randn(len(t)) * 0.05)
audio_int16 = (audio * 16000).astype(np.int16)

CHUNK = 1280

# ---- Run reference ----
print("=" * 60)
print("Processing audio through REFERENCE preprocessor...")
print("=" * 60)
for i in range(0, len(audio_int16) - CHUNK, CHUNK):
    af(audio_int16[i:i+CHUNK])

ref_mel = af.melspectrogram_buffer
ref_feat = af.feature_buffer
print(f"  Melspec buffer: {ref_mel.shape}, range [{ref_mel.min():.4f}, {ref_mel.max():.4f}], mean={ref_mel.mean():.4f}")
print(f"  Feature buffer: {ref_feat.shape}, range [{ref_feat.min():.4f}, {ref_feat.max():.4f}], mean={ref_feat.mean():.4f}")
print(f"  Melspec sample [0,:5]: {ref_mel[0, :5]}")
print(f"  Feature sample [-1,:5]: {ref_feat[-1, :5]}")

# ---- Run our FIXED TFLite pipeline ----
print()
print("=" * 60)
print("Processing audio through FIXED TFLite pipeline...")
print("=" * 60)

mel_interp = tf.lite.Interpreter(model_path="melspectrogram.tflite")
mel_interp.allocate_tensors()
emb_interp = tf.lite.Interpreter(model_path="embedding_model.tflite")
emb_interp.allocate_tensors()

mel_in = mel_interp.get_input_details()[0]
mel_out = mel_interp.get_output_details()[0]
emb_in = emb_interp.get_input_details()[0]
emb_out = emb_interp.get_output_details()[0]

our_mel_buffer = []
our_feat_buffer = []

for i in range(0, len(audio_int16) - CHUNK, CHUNK):
    chunk = audio_int16[i:i+CHUNK].astype(np.float32).reshape(1, CHUNK)
    
    mel_interp.set_tensor(mel_in['index'], chunk)
    mel_interp.invoke()
    mel_output = mel_interp.get_tensor(mel_out['index'])  # [1, 1, 5, 32]
    
    spec = np.squeeze(mel_output)  # (5, 32)
    spec = spec / 10.0 + 2.0  # THE CRITICAL TRANSFORM
    
    for f in range(spec.shape[0]):
        our_mel_buffer.append(spec[f])
    
    if len(our_mel_buffer) >= 76:
        emb_input = np.array(our_mel_buffer[-76:]).astype(np.float32)[None, :, :, None]
        
        emb_interp.set_tensor(emb_in['index'], emb_input)
        emb_interp.invoke()
        emb_output = emb_interp.get_tensor(emb_out['index'])
        
        our_feat_buffer.append(emb_output.squeeze())

our_mel = np.array(our_mel_buffer)
our_feat = np.array(our_feat_buffer)
print(f"  Melspec buffer: {our_mel.shape}, range [{our_mel.min():.4f}, {our_mel.max():.4f}], mean={our_mel.mean():.4f}")
print(f"  Feature buffer: {our_feat.shape}, range [{our_feat.min():.4f}, {our_feat.max():.4f}], mean={our_feat.mean():.4f}")
print(f"  Melspec sample [0,:5]: {our_mel[0, :5]}")
print(f"  Feature sample [-1,:5]: {our_feat[-1, :5]}")

# ---- Compare ----
print()
print("=" * 60)
print("COMPARISON")
print("=" * 60)

# Compare melspec (might differ slightly due to ONNX vs TFLite numerical differences)
min_mel = min(ref_mel.shape[0], our_mel.shape[0])
mel_diff = np.abs(ref_mel[:min_mel] - our_mel[:min_mel])
print(f"  Melspec MAE: {mel_diff.mean():.6f} (max diff: {mel_diff.max():.6f})")

# Compare features
min_feat = min(ref_feat.shape[0], our_feat.shape[0])
if min_feat > 0:
    feat_diff = np.abs(ref_feat[:min_feat] - our_feat[:min_feat])
    print(f"  Feature MAE: {feat_diff.mean():.6f} (max diff: {feat_diff.max():.6f})")

    if mel_diff.mean() < 0.5 and feat_diff.mean() < 1.0:
        print("\n  ✅ PIPELINE MATCH! Our fixed implementation matches the reference.")
    else:
        print("\n  ❌ MISMATCH! Values differ significantly.")
        print(f"     Ref mel sample: {ref_mel[5, :5]}")
        print(f"     Our mel sample: {our_mel[5, :5]}")
