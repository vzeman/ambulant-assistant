export function selectSlovakVoice(voices) {
  return (
    [...voices]
      .filter((v) => /^sk(?:[-_]|$)/i.test(v.lang || ""))
      .sort(
        (a, b) =>
          Number(!!b.localService) - Number(!!a.localService) ||
          Number(!!b.default) - Number(!!a.default),
      )[0] || null
  );
}

// Browsers can populate the voice catalogue after the page has loaded.
export async function loadSlovakVoice(synthesis, timeoutMs = 1500) {
  const existing = selectSlovakVoice(synthesis.getVoices());
  if (existing) return existing;
  return new Promise((resolve) => {
    const finish = (voice) => {
      clearTimeout(timer);
      synthesis.removeEventListener("voiceschanged", changed);
      resolve(voice);
    };
    const changed = () => {
      const voice = selectSlovakVoice(synthesis.getVoices());
      if (voice) finish(voice);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    synthesis.addEventListener("voiceschanged", changed);
    changed();
  });
}
