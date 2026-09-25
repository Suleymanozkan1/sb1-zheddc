import { api } from "./api";
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
    toast("error", `Could not sign out: ${errorMessage(err)}`);
    return;
  }
  setMe(null);
  go("landing");
}
