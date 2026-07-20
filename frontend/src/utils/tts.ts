import { Sound } from "react-native-nitro-sound";
import RNFS from "react-native-fs";
import { Buffer } from "buffer";
import { ASR_URL } from "@env";

/**
 * Fetches MP3 audio from the ASR TTS engine and plays it immediately.
 * 
 * @param text The text to speak.
 */
export const speakTTS = async (text: string): Promise<void> => {
  try {
    const res = await fetch(`${ASR_URL}/api/tts/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) throw new Error("TTS Server Error");

    const arrayBuffer = await res.arrayBuffer();
    const path = `${RNFS.CachesDirectoryPath}/tts.mp3`;

    // Save buffer to file then play
    await RNFS.writeFile(path, Buffer.from(arrayBuffer).toString("base64"), "base64");
    
    await new Promise<void>((resolve, reject) => {
      Sound.addPlaybackEndListener(() => {
        Sound.removePlaybackEndListener();
        resolve();
      });
      
      Sound.startPlayer(path).catch((err) => {
        Sound.removePlaybackEndListener();
        reject(err);
      });
    });
  } catch (err) {
    console.error("[TTS Utility] Error playing TTS:", err);
    throw err;
  }
};
