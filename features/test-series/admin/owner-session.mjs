"use strict";

export function watchOwnerSession({
  subscribe,
  hasPhoneMfa,
  verifyOwner,
  signOut,
  onSignedOut = () => {},
  onMfaRequired = () => {},
  onAuthorized = () => {},
  onError = () => {}
} = {}) {
  for (const [name, fn] of Object.entries({ subscribe, hasPhoneMfa, verifyOwner, signOut })) {
    if (typeof fn !== "function") throw new TypeError(name + " must be a function");
  }

  let disposed = false;
  let generation = 0;

  const unsubscribe = subscribe(user => {
    const currentGeneration = ++generation;
    if (disposed) return;

    if (!user) {
      onSignedOut();
      return;
    }

    let phoneMfaReady;
    try {
      phoneMfaReady = hasPhoneMfa(user);
    } catch (error) {
      onError(error);
      return;
    }

    if (!phoneMfaReady) {
      onMfaRequired(user);
      return;
    }

    Promise.resolve()
      .then(() => verifyOwner(user))
      .then(authorization => {
        if (disposed || currentGeneration !== generation) return;
        if (!authorization || authorization.authorized !== true) {
          throw new Error("Owner authorization was not confirmed by the server.");
        }
        onAuthorized(user, authorization);
      })
      .catch(async error => {
        if (disposed || currentGeneration !== generation) return;
        onError(error);
        try {
          await signOut();
        } catch (signOutError) {
          if (!disposed && currentGeneration === generation) onError(signOutError);
        }
      });
  });

  return () => {
    if (disposed) return;
    disposed = true;
    generation += 1;
    if (typeof unsubscribe === "function") unsubscribe();
  };
}
