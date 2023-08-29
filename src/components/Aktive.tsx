import React from "react";
import Image from "next/image";

export default function Aktive() {
  const slides = ["/0.png", "/1.png", "/2.png"];

  return (
    <div className="flex transition-transform duration-500 ease-out">
      {slides.map((img) => (
        <Image src={img} alt="Image" width={1080} height={720} key={img} />
      ))}
    </div>
  );
}
