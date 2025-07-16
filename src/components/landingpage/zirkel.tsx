/* eslint-disable */
"use client";
import lottie from "lottie-web";
import { useEffect, useRef } from "react";

const Zirkel = () => {
	const animationContainer = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!animationContainer.current) return;
		const anim = lottie.loadAnimation({
			container: animationContainer.current,
			renderer: "svg",
			loop: false,
			autoplay: true,
			path: "animation.json",
		});
		anim.setSpeed(1);
		return () => anim.destroy();
	}, []);

	return <div ref={animationContainer} className="w-1/2" />;
};

export default Zirkel;
