/* =====================================
   RAILWAY MITRA - MODULE LOADER
   Modular Development System
   Developer: Rohit Kumar
===================================== */

"use strict";

const RailwayMitraModuleLoader = {

    configPath: new URL("../../config/modules.json", document.currentScript.src).href,

    async load() {
        try {
            const response = await fetch(this.configPath, {
                cache: "no-cache"
            });

            if (!response.ok) {
                throw new Error("Module configuration not found");
            }

            const config = await response.json();

            const modules = Array.isArray(config)
                ? config
                : config.modules;

            if (!Array.isArray(modules)) {
                throw new Error("Invalid modules configuration");
            }

            return modules.filter(module =>
                module &&
                module.enabled === true &&
                typeof module.id === "string" &&
                typeof module.name === "string" &&
                typeof module.path === "string"
            );

        } catch (error) {
            console.error("Railway Mitra Module Loader:", error);
            return [];
        }
    }
};

window.RailwayMitraModuleLoader = RailwayMitraModuleLoader;
