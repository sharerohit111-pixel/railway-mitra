"use strict";

export function watchOwnerSession({
  subscribe,
  hasPhoneMfa,
  verifyOwner,
  signOut,
  onSignedOut = () => {},
  onChecking = () => {},
  onMfaRequired = () => {},
  onAuthorized = () => {},
  onError = () => {}
} = {}) {
  for (const [name, fn] of Object.entries({ subscribe, hasPhoneMfa, verifyOwner, signOut })) {
    if (typeof fn !== "function") throw new TypeError(name + " must be a function");
  }

  let disposed = false;
  let generation = 0;

  const isCurrent = currentGeneration => !disposed && currentGeneration === generation;
  const reportError = error => {
    // A broken status/notification callback must never interrupt session cleanup.
    try {
      const result = onError(error);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (_) {
      // Error reporting is best-effort; authorization cleanup remains mandatory.
    }
  };
  const rejectCurrentSession = async (user, currentGeneration, error) => {
    if (!isCurrent(currentGeneration)) return;
    reportError(error);
    if (!isCurrent(currentGeneration)) return;
    try {
      // Pass the rejected user so adapters can avoid signing out a different account.
      await signOut(user);
    } catch (signOutError) {
      if (isCurrent(currentGeneration)) reportError(signOutError);
    }
  };

  const unsubscribe = subscribe(user => {
    const currentGeneration = ++generation;
    if (disposed) return;

    if (!user) {
      try {
        // Signed-out cleanup is best-effort. Its error belongs only to this
        // auth generation; a late rejection must not overwrite a new session.
        Promise.resolve(onSignedOut()).catch(error => {
          if (isCurrent(currentGeneration)) reportError(error);
        });
      } catch (error) {
        if (isCurrent(currentGeneration)) reportError(error);
      }
      return;
    }

    // Hide and clear the previous Owner workspace immediately on every
    // authenticated account transition, before awaiting optional async cleanup.
    let checkingResult;
    try {
      checkingResult = onChecking(user);
    } catch (error) {
      void rejectCurrentSession(user, currentGeneration, error);
      return;
    }

    // Treat lifecycle callbacks as part of the authorization transition. An
    // async cleanup failure must prevent MFA/server checks and sign out only
    // the still-current rejected UID.
    Promise.resolve(checkingResult)
      .then(() => {
        if (!isCurrent(currentGeneration)) return;
        // Firebase currently exposes enrolled factors synchronously, but keep
        // the boundary Promise-aware so an adapter can refresh/read MFA state
        // asynchronously without accidentally treating a pending Promise as
        // a successful MFA check.
        return Promise.resolve()
          .then(() => hasPhoneMfa(user))
          .then(phoneMfaReady => {
            if (!isCurrent(currentGeneration)) return;
            if (!phoneMfaReady) return onMfaRequired(user);
            return Promise.resolve()
              .then(() => verifyOwner(user))
              .then(authorization => {
                if (!isCurrent(currentGeneration)) return;
                if (!authorization || authorization.authorized !== true) {
                  throw new Error("Owner authorization was not confirmed by the server.");
                }
                // Return the callback result so async dashboard initialization failures
                // enter the same fail-closed path as server authorization failures.
                return onAuthorized(user, authorization);
              });
          });
      })
      .catch(error => rejectCurrentSession(user, currentGeneration, error));
  });

  return () => {
    if (disposed) return;
    disposed = true;
    generation += 1;
    if (typeof unsubscribe === "function") unsubscribe();
  };
}
