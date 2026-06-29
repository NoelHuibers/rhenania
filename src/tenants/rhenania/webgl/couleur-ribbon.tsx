"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { PALETTE } from "../theme";
import type { SharedMotion } from "./scene";

const vertexShader = /* glsl */ `
	uniform float uTime;
	uniform float uScroll;
	uniform float uAmp;
	varying vec2 vUv;
	varying float vWave;

	void main() {
		vUv = uv;
		vec3 pos = position;
		// Travelling waves along the ribbon length (x).
		float w1 = sin(pos.x * 0.55 + uTime * 0.9);
		float w2 = sin(pos.x * 1.3 - uTime * 0.6 + uScroll * 3.0);
		float wave = (w1 * 0.65 + w2 * 0.35) * uAmp;
		// Twist across the width (y) so it reads as a fluttering band.
		pos.z += wave + sin(pos.y * 2.0 + uTime * 0.5) * uAmp * 0.25;
		vWave = wave;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
	}
`;

const fragmentShader = /* glsl */ `
	uniform vec3 uRose;
	uniform vec3 uWhite;
	uniform vec3 uAzure;
	uniform float uOpacity;
	varying vec2 vUv;
	varying float vWave;

	void main() {
		// Tricolor bands (rosa-weiß-azurblau) across the width with soft seams.
		vec3 col = mix(uAzure, uWhite, smoothstep(0.30, 0.42, vUv.y));
		col = mix(col, uRose, smoothstep(0.58, 0.70, vUv.y));
		// Sheen from the wave so the fabric catches light.
		float sheen = 0.5 + 0.5 * vWave;
		col += sheen * 0.10;
		// Fade the long ends so the ribbon dissolves into the dark.
		float endFade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
		gl_FragColor = vec4(col, uOpacity * endFade);
	}
`;

export function CouleurRibbon({
	shared,
	reducedMotion,
	segments,
	position = [0, -0.6, -3],
	rotation = [0.1, 0, -0.32],
	scale = 1,
	opacity = 0.85,
}: {
	shared: SharedMotion;
	reducedMotion: boolean;
	segments: number;
	position?: [number, number, number];
	rotation?: [number, number, number];
	scale?: number;
	opacity?: number;
}) {
	const uniforms = useMemo(
		() => ({
			uTime: { value: 0 },
			uScroll: { value: 0 },
			uAmp: { value: reducedMotion ? 0.12 : 0.55 },
			uOpacity: { value: opacity },
			uRose: { value: new THREE.Color(PALETTE.rose) },
			uWhite: { value: new THREE.Color(PALETTE.white) },
			uAzure: { value: new THREE.Color(PALETTE.azure) },
		}),
		[reducedMotion, opacity],
	);

	useFrame((state) => {
		if (!reducedMotion) {
			uniforms.uTime.value = state.clock.elapsedTime;
		}
		uniforms.uScroll.value = shared.scroll;
	});

	return (
		<mesh position={position} rotation={rotation} scale={scale}>
			<planeGeometry
				args={[18, 2.6, segments, Math.max(8, Math.floor(segments / 6))]}
			/>
			<shaderMaterial
				vertexShader={vertexShader}
				fragmentShader={fragmentShader}
				uniforms={uniforms}
				transparent
				side={THREE.DoubleSide}
				depthWrite={false}
			/>
		</mesh>
	);
}
