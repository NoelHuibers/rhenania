"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { Suspense } from "react";
import type * as THREE from "three";
import { ACESFilmicToneMapping } from "three";
import { PALETTE } from "../theme";
import { CouleurRibbon } from "./couleur-ribbon";
import { ZirkelMesh } from "./zirkel-mesh";

// Mutable, shared between the DOM (scroll/pointer listeners in experience.tsx)
// and the render loop. The same object reference is mutated in place so
// useFrame reads live values without triggering React re-renders.
export type SharedMotion = {
	scroll: number;
	pointerX: number;
	pointerY: number;
};

export function Scene({
	shared,
	reducedMotion,
	quality,
}: {
	shared: SharedMotion;
	reducedMotion: boolean;
	quality: "low" | "high";
}) {
	const ribbonSegments = quality === "high" ? 220 : 90;

	return (
		<>
			<color attach="background" args={[PALETTE.bg]} />
			<fog attach="fog" args={[PALETTE.bg, 7, 17]} />

			<ambientLight intensity={0.7} />
			<directionalLight
				position={[3, 5, 6]}
				intensity={1.4}
				color={PALETTE.white}
			/>
			<directionalLight
				position={[-5, 1, 3]}
				intensity={0.8}
				color={PALETTE.azure}
			/>

			{/* Offline image-based lighting so the silver Zirkel reads as polished
			    chrome catching rose + azure highlights (no network HDR fetch). */}
			<Environment resolution={256}>
				<Lightformer
					intensity={2.2}
					color={PALETTE.white}
					position={[0, 2, 4]}
					scale={[8, 8, 1]}
				/>
				<Lightformer
					intensity={1.6}
					color={PALETTE.rose}
					position={[-5, 0, 2]}
					scale={[5, 5, 1]}
				/>
				<Lightformer
					intensity={1.6}
					color={PALETTE.azure}
					position={[5, 0, 2]}
					scale={[5, 5, 1]}
				/>
				<Lightformer
					intensity={1.0}
					color={PALETTE.white}
					position={[0, -4, 2]}
					scale={[10, 4, 1]}
				/>
			</Environment>

			<Suspense fallback={null}>
				<ZirkelMesh shared={shared} reducedMotion={reducedMotion} />
			</Suspense>

			<CouleurRibbon
				shared={shared}
				reducedMotion={reducedMotion}
				segments={ribbonSegments}
				position={[0, -1.4, -3.2]}
				rotation={[0.12, 0, -0.34]}
				scale={1}
				opacity={0.92}
			/>
			{quality === "high" && (
				<CouleurRibbon
					shared={shared}
					reducedMotion={reducedMotion}
					segments={ribbonSegments}
					position={[0, 1.9, -4.5]}
					rotation={[-0.1, 0, 0.28]}
					scale={0.8}
					opacity={0.5}
				/>
			)}
		</>
	);
}

// Tone mapping / color setup applied once via the Canvas onCreated hook.
export function configureRenderer(gl: THREE.WebGLRenderer) {
	gl.toneMapping = ACESFilmicToneMapping;
	gl.toneMappingExposure = 1.1;
}
