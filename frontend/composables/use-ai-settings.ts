export function useAISettings() {
  const apiKey = useLocalStorage<string>("homebox.openai.api_key", "", {
    listenToStorageChanges: true,
  });

  const hasApiKey = computed(() => Boolean(apiKey.value.trim()));

  function setApiKey(value: string) {
    apiKey.value = value.trim();
  }

  function clearApiKey() {
    apiKey.value = "";
  }

  function promptForApiKey(message = "Enter your OpenAI API key to enable AI prefill.") {
    if (!import.meta.client) {
      return false;
    }

    const next = window.prompt(message, apiKey.value || "");
    if (!next) {
      return false;
    }

    setApiKey(next);
    return true;
  }

  return {
    apiKey,
    hasApiKey,
    setApiKey,
    clearApiKey,
    promptForApiKey,
  };
}
