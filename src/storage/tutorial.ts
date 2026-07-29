import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tutorial progress is stored under its own key rather than being folded
 * into the puzzle progress payload, so that a change to either schema
 * cannot invalidate the other.
 */

const KEY = 'bagchaal:tutorial:v1';

/** Index of the furthest step reached. */
export async function loadTutorialStep(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return 0;
    const value = Number.parseInt(raw, 10);
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export async function saveTutorialStep(index: number): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(index));
  } catch {
    // Losing a step marker is not worth interrupting the lesson.
  }
}

export async function clearTutorialProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing useful to do if the delete fails.
  }
}
