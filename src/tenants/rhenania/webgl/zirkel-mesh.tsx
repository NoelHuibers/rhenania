"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { PALETTE } from "../theme";
import type { SharedMotion } from "./scene";

const silver = new THREE.Color(PALETTE.silver);

export function ZirkelMesh({
	shared,
	reducedMotion,
}: {
	shared: SharedMotion;
	reducedMotion: boolean;
}) {
	const data = useLoader(SVGLoader, "/zirkel.svg");
	const group = useRef<THREE.Group>(null);
	const inner = useRef<THREE.Group>(null);

	const geometry = useMemo(() => {
		const shapes: THREE.Shape[] = [];
		for (const path of data.paths) {
			// The visible monogram is the filled paths; SVG "st0" outlines are
			// fill:none and only describe negative space — skip them.
			const fill = (path.userData as { style?: { fill?: string } } | undefined)
				?.style?.fill;
			if (fill && fill !== "none") {
				shapes.push(...SVGLoader.createShapes(path));
			}
		}

		const geom = new THREE.ExtrudeGeometry(shapes, {
			depth: 14,
			bevelEnabled: true,
			bevelThickness: 2.5,
			bevelSize: 1.4,
			bevelSegments: 4,
			curveSegments: 14,
		});

		geom.computeBoundingBox();
		const bb = geom.boundingBox;
		if (!bb) return geom;
		const cx = (bb.max.x + bb.min.x) / 2;
		const cy = (bb.max.y + bb.min.y) / 2;
		const cz = (bb.max.z + bb.min.z) / 2;
		geom.translate(-cx, -cy, -cz);

		const size = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y);
		const scale = 3.4 / size;
		// Flip Y: SVG coordinates are Y-down, three.js is Y-up.
		geom.scale(scale, -scale, scale);
		geom.computeVertexNormals();
		return geom;
	}, [data]);

	useEffect(() => {
		return () => geometry.dispose();
	}, [geometry]);

	// Intro reveal.
	useEffect(() => {
		const g = inner.current;
		if (!g) return;
		if (reducedMotion) {
			g.scale.setScalar(1);
			g.rotation.set(0, 0, 0);
			return;
		}
		g.scale.setScalar(0.001);
		g.rotation.y = -Math.PI * 1.2;
		const tl = gsap.timeline();
		tl.to(g.scale, {
			x: 1,
			y: 1,
			z: 1,
			duration: 1.6,
			ease: "expo.out",
			delay: 0.2,
		});
		tl.to(g.rotation, { y: 0, duration: 2.0, ease: "expo.out" }, "<");
		return () => {
			tl.kill();
		};
	}, [reducedMotion]);

	useFrame((state, delta) => {
		const g = group.current;
		if (!g) return;
		const t = state.clock.elapsedTime;

		// Pointer parallax (eased) + gentle idle sway.
		const targetRotX = reducedMotion ? 0 : shared.pointerY * 0.25;
		const targetRotY = reducedMotion
			? 0
			: shared.pointerX * 0.5 + Math.sin(t * 0.25) * 0.08;

		g.rotation.x += (targetRotX - g.rotation.x) * Math.min(1, delta * 3);
		g.rotation.y += (targetRotY - g.rotation.y) * Math.min(1, delta * 3);

		// Scroll docking: lift up and shrink as the hero scrolls away.
		const p = Math.min(1, shared.scroll * 2.2);
		const dock = THREE.MathUtils.lerp(1, 0.42, p);
		g.scale.setScalar(dock);
		g.position.y = THREE.MathUtils.lerp(0, 2.6, p);
		g.position.z = THREE.MathUtils.lerp(0, 1.4, p);
	});

	return (
		<group ref={group}>
			<group ref={inner}>
				<mesh geometry={geometry} castShadow receiveShadow>
					<meshStandardMaterial
						color={silver}
						metalness={0.95}
						roughness={0.22}
						envMapIntensity={1.25}
					/>
				</mesh>
			</group>
		</group>
	);
}
