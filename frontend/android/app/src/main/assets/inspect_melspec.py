import tensorflow as tf

import numpy as np

def inspect_model(model_path):
    print(f"Inspecting: {model_path}")
    interpreter = tf.lite.Interpreter(model_path=model_path)
    
    in_det = interpreter.get_input_details()[0]
    try:
        interpreter.resize_tensor_input(in_det['index'], [1, 1280] if 'mel' in model_path else in_det['shape'])
        interpreter.allocate_tensors()
    except Exception as e:
        print(f"Allocate failed: {e}")
        return
        
    in_det = interpreter.get_input_details()[0]
    out_det = interpreter.get_output_details()[0]
    
    print(f"Input: {in_det['shape']}")
    
    try:
        # Generate dummy data
        dummy = np.zeros(in_det['shape'], dtype=np.float32)
        interpreter.set_tensor(in_det['index'], dummy)
        interpreter.invoke()
        res = interpreter.get_tensor(out_det['index'])
        print(f"Success! Output: {res.shape}")
    except Exception as e:
        print(f"Failed inference: {e}")

if __name__ == "__main__":
    inspect_model("melspectrogram.tflite")
    print("\n----------------\n")
    inspect_model("embedding_model.tflite")
    print("\n----------------\n")
    inspect_model("hey_route.tflite")
