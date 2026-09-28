import { api } from "./api";
import { t as tNow } from "./i18n";
import { errorMessage, useApp } from "./store";

/**
 * Signs out on the server first. Local state is cleared only when the server confirmed it, so a
 * failed request never shows a signed-out UI while the session cookies are still valid.
 */
export async function signOut(): Promise<void> {
  const { setMe, go, toast } = useApp.getState();
  try {
    await api.logout();
  } catch (err) {
    toast("error", tNow("Could not sign out: {error}", { error: errorMessage(err) }));
    return;
  }
  setMe(null);
  go("landing");
}
