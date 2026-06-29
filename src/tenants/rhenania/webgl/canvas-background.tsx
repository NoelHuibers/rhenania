"use client";

import { Canvas } from "@react-three/fiber";
import { configureRenderer, Scene, type SharedMotion } from "./scene";

export default function CanvasBackground({
	shared,
	reducedMotion,
	quality,
	dpr,
}: {
	shared: SharedMotion;
	reducedMotion: boolean;
	quality: "low" | "high";
	dpr: [number, number];
}) {
	return (
		<Canvas
			style={{ width: "100%", height: "100%" }}
			dpr={dpr}
			gl={{
				antialias: quality === "high",
				alpha: false,
				powerPreference: "high-performance",
			}}
			camera={{ position: [0, 0, 7], fov: 42 }}
			onCreated={({ gl }) => configureRenderer(gl)}
		>
			<Scene shared={shared} reducedMotion={reducedMotion} quality={quality} />
		</Canvas>
	);
}
