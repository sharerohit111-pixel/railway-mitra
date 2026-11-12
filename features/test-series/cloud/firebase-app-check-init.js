// Isolated App Check bootstrap for Railway Mitra CBT only.
// Import this module from CBT pages/functions that need App Check.
// Existing Railway Mitra features continue using assets/js/firebase.js unchanged.
import { app } from "../../../assets/js/firebase.js";
import { initializeRailwayMitraAppCheck } from "./app-check.js";

export const testSeriesAppCheck = initializeRailwayMitraAppCheck(app);
