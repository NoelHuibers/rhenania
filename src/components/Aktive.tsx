import React from "react";
import Image from "next/image";

export default function Aktive() {
  const slides = ["/0.png", "/1.jpg", "/2.png"];

  return (
    <div className="relative flex h-64 w-screen">
      {slides.map((img) => (
        <div className="relative w-1/3" key={img}>
          <Image src={img} alt="Image" fill={true} />
        </div>
      ))}
    </div>
  );
}
