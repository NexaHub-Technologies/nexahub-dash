import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		/* the functions run in Frankfurt, beside the database and Neon Auth
		   (aws-eu-central-1); Vercel's default, Washington, put an ocean
		   between every query and the server */
		nitro({
			vercel: { functions: { regions: ["fra1"] } },
			/* shipped as real packages, not bundled: @react-pdf/font finds its
			   standard fonts (Helvetica) through its own package.json "imports"
			   (#standard-fonts/...), which a bundle leaves unresolvable, and the
			   PDF record download failed in production */
			traceDeps: ["@react-pdf/font*", "pdfkit*"],
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
});
