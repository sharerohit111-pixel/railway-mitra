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
        onSignedOut();
      } catch (error) {
        reportError(error);
      }
      return;
    }

    // Hide and clear the previous Owner workspace immediately on every
    // authenticated account transition, before MFA checks or server calls.
    try {
      onChecking(user);
    } catch (error) {
      void rejectCurrentSession(user, currentGeneration, error);
      return;
    }

    let phoneMfaReady;
    try {
      phoneMfaReady = hasPhoneMfa(user);
    } catch (error) {
      void rejectCurrentSession(user, currentGeneration, error);
      return;
    }

    if (!phoneMfaReady) {
      try {
        onMfaRequired(user);
      } catch (error) {
        void rejectCurrentSession(user, currentGeneration, error);
      }
      return;
    }

    Promise.resolve()
      .then(() => verifyOwner(user))
      .then(authorization => {
        if (!isCurrent(currentGeneration)) return;
        if (!authorization || authorization.authorized !== true) {
          throw new Error("Owner authorization was not confirmed by the server.");
        }
        onAuthorized(user, authorization);
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
