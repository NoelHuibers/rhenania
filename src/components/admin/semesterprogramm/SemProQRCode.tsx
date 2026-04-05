"use client";

import { QRCodeCanvas } from "qrcode.react";
import { useRef } from "react";
import { Button } from "~/components/ui/button";

export function SemProQRCode({ url }: { url: string }) {
	const webcalUrl = url.replace(/^https?/, "webcal");
	const canvasRef = useRef<HTMLDivElement>(null);

	function handleDownload() {
		const canvas = canvasRef.current?.querySelector("canvas");
		if (!canvas) return;
		const link = document.createElement("a");
		link.download = "semesterprogramm-qrcode.png";
		link.href = canvas.toDataURL("image/png");
		link.click();
	}

	return (
		<div className="flex flex-col items-center gap-6 py-8">
			<p className="text-muted-foreground text-sm">
				QR-Code für:{" "}
				<span className="font-mono text-foreground">{webcalUrl}</span>
			</p>
			<div ref={canvasRef} className="rounded-xl border bg-white p-4 shadow-sm">
				<QRCodeCanvas value={webcalUrl} size={240} marginSize={2} />
			</div>
			<Button onClick={handleDownload}>Als PNG herunterladen</Button>
		</div>
	);
}
